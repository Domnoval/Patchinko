"""The Dejipachi machine — the core game loop and hidden state machine.

A `DejipachiMachine` consumes binary `start_chucker` triggers (the only
remaining role of the physical ball) and emits a stream of typed events.
There is no rendering here. There is no physics. There is only state, RNG,
and engineered pacing.
"""
from __future__ import annotations

import random
from collections import deque
from dataclasses import dataclass, field
from typing import Callable, Deque, List, Optional

from .events import (
    Event,
    PayoutEvent,
    ReachEvent,
    SpinResolvedEvent,
    StartChuckerEvent,
    StateTransitionEvent,
)
from .reach import ReachDirector, ReachTier
from .rng import OddsTable, ProbabilityEngine, SpinResult
from .states import EventType, MachineState, ReelOutcome


EventListener = Callable[[Event], None]


@dataclass
class MachineConfig:
    base_jackpot_balls: int = 1_500
    """Balls released by a standard JACKPOT payout (the 'Attacker' phase)."""

    kakuhen_spins: int = 80
    """How many spins the KAKUHEN window lasts before reverting to NORMAL."""

    jitan_spins_after_kakuhen: int = 100
    """JITAN tail that follows KAKUHEN to keep spin density high."""

    koatari_balls: int = 5
    """Tiny payout that masks the silent KAKUHEN entry."""

    odds: OddsTable = field(default_factory=OddsTable)


class DejipachiMachine:
    """The informational engine.

    Drive it with `start_chucker()` to enqueue spins, then `tick()` to advance
    the loop. Subscribe with `on_event()` to receive everything.
    """

    def __init__(
        self,
        config: Optional[MachineConfig] = None,
        seed: Optional[int] = None,
    ) -> None:
        self.config = config or MachineConfig()
        self._rand = random.Random(seed)
        self._rng = ProbabilityEngine(self.config.odds, seed=seed)
        self._reach = ReachDirector(self._rand)

        self._state: MachineState = MachineState.NORMAL
        self._spins_remaining_in_state: int = 0
        self._listeners: List[EventListener] = []
        self._spin_queue: Deque[None] = deque()
        self._tick: int = 0
        self._payout_balls_remaining: int = 0

    # --------------------------------------------------------------- public API

    @property
    def state(self) -> MachineState:
        return self._state

    @property
    def queued_spins(self) -> int:
        return len(self._spin_queue)

    def on_event(self, listener: EventListener) -> None:
        self._listeners.append(listener)

    def start_chucker(self, balls: int = 1) -> None:
        """A ball tipped the start chucker. Buys `balls` spins."""
        for _ in range(balls):
            self._spin_queue.append(None)
        self._emit(
            StartChuckerEvent(
                type=EventType.START_CHUCKER,
                tick=self._tick,
                spins_queued=len(self._spin_queue),
            )
        )

    def tick(self) -> None:
        """Advance the loop by one spin (or one payout ball-batch)."""
        self._tick += 1

        if self._state == MachineState.PAYOUT:
            self._advance_payout()
            return

        if not self._spin_queue:
            return

        self._spin_queue.popleft()
        result = self._rng.spin(self._state)
        self._present_spin(result)
        self._resolve_outcome(result)
        self._maybe_decay_state()

    def run_until_idle(self, max_ticks: int = 100_000) -> None:
        """Drain queued spins and any active payout."""
        guard = 0
        while (self._spin_queue or self._state == MachineState.PAYOUT) and guard < max_ticks:
            self.tick()
            guard += 1

    # ------------------------------------------------------------- presentation

    def _present_spin(self, result: SpinResult) -> None:
        """Run the Reach director and emit any tension events before the
        final SpinResolvedEvent. The hold itself is wall-clock theater for
        the frontend; the engine treats it as a pure declarative event."""
        decision = self._reach.decide(result.outcome, self._state)
        if decision.tier != ReachTier.NONE:
            self._emit(
                ReachEvent(
                    type=EventType.REACH,
                    tick=self._tick,
                    tier=decision.tier.name,
                    hold_ms=decision.hold_ms,
                    predetermined_outcome=result.outcome,
                )
            )
        self._emit(
            SpinResolvedEvent(
                type=EventType.SPIN_RESOLVED,
                tick=self._tick,
                outcome=result.outcome,
                reels=result.reels,
            )
        )

    # -------------------------------------------------------------- transitions

    def _resolve_outcome(self, result: SpinResult) -> None:
        if result.outcome == ReelOutcome.JACKPOT:
            self._open_payout(
                balls=self.config.base_jackpot_balls,
                post_state=MachineState.NORMAL,
                post_state_silent=False,
            )

        elif result.outcome == ReelOutcome.KAKUHEN_JACKPOT:
            # Player sees the win; the KAKUHEN window that follows is the
            # 'fever' loop they think they're skill-extending.
            self._open_payout(
                balls=self.config.base_jackpot_balls,
                post_state=MachineState.KAKUHEN,
                post_state_silent=False,
            )

        elif result.outcome == ReelOutcome.KOATARI:
            # Tiny visible payout, then a SILENT transition into KAKUHEN —
            # the player thinks they got a small win; really they were just
            # smuggled into a high-probability window.
            self._open_payout(
                balls=self.config.koatari_balls,
                post_state=MachineState.KAKUHEN,
                post_state_silent=True,
            )

        # MISS / REACH_MISS: no transition, no payout.

    def _maybe_decay_state(self) -> None:
        if self._state in (MachineState.KAKUHEN, MachineState.JITAN):
            self._spins_remaining_in_state -= 1
            if self._spins_remaining_in_state <= 0:
                if self._state == MachineState.KAKUHEN:
                    # KAKUHEN exits into JITAN to keep spin density high
                    # while the player slowly slips back to base odds.
                    self._transition(MachineState.JITAN, silent=False)
                    self._spins_remaining_in_state = self.config.jitan_spins_after_kakuhen
                else:
                    self._transition(MachineState.NORMAL, silent=False)

    def _transition(self, new_state: MachineState, silent: bool) -> None:
        if new_state == self._state:
            return
        prev = self._state
        self._state = new_state
        self._emit(
            StateTransitionEvent(
                type=EventType.STATE_TRANSITION,
                tick=self._tick,
                from_state=prev,
                to_state=new_state,
                silent=silent,
            )
        )

    # ------------------------------------------------------------------ payout

    def _open_payout(
        self,
        balls: int,
        post_state: MachineState,
        post_state_silent: bool,
    ) -> None:
        self._payout_balls_remaining = balls
        self._post_payout_state = post_state
        self._post_payout_silent = post_state_silent
        prev = self._state
        self._state = MachineState.PAYOUT
        self._emit(
            StateTransitionEvent(
                type=EventType.STATE_TRANSITION,
                tick=self._tick,
                from_state=prev,
                to_state=MachineState.PAYOUT,
                silent=False,
            )
        )
        # Announcement — "the Attacker is opening; this many balls inbound."
        # balls=0 keeps the per-batch events the only source of delivered counts.
        self._emit(
            PayoutEvent(
                type=EventType.PAYOUT_OPEN,
                tick=self._tick,
                balls=0,
                rounds_remaining=balls,
            )
        )

    def _advance_payout(self) -> None:
        # Drain payout in batches per tick — the hypnotic stream the player
        # sees flowing into the tray. Batch size matches the 'Attacker' gate
        # opening cadence on a real machine (~50 balls per round).
        batch = min(50, self._payout_balls_remaining)
        self._payout_balls_remaining -= batch
        self._emit(
            PayoutEvent(
                type=EventType.PAYOUT_OPEN,
                tick=self._tick,
                balls=batch,
                rounds_remaining=self._payout_balls_remaining,
            )
        )
        if self._payout_balls_remaining <= 0:
            self._emit(
                PayoutEvent(
                    type=EventType.PAYOUT_CLOSE,
                    tick=self._tick,
                    balls=0,
                    rounds_remaining=0,
                )
            )
            target = self._post_payout_state
            silent = self._post_payout_silent
            self._state = MachineState.NORMAL  # so _transition sees a real change
            self._transition(target, silent=silent)
            if target in (MachineState.KAKUHEN, MachineState.JITAN):
                self._spins_remaining_in_state = (
                    self.config.kakuhen_spins
                    if target == MachineState.KAKUHEN
                    else self.config.jitan_spins_after_kakuhen
                )

    # ---------------------------------------------------------------- dispatch

    def _emit(self, event: Event) -> None:
        for listener in self._listeners:
            listener(event)
