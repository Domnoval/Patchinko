"""Event payloads emitted by the engine.

A frontend (or logger, or telemetry pipeline) subscribes to these. The engine
itself never renders or animates — it only declares what *happened*.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .states import EventType, MachineState, ReelOutcome


@dataclass
class Event:
    type: EventType
    tick: int


@dataclass
class StartChuckerEvent(Event):
    """A ball physically tipped the start chucker. From the engine's view this
    is just a binary trigger that buys one RNG spin."""

    spins_queued: int = 0


@dataclass
class ReachEvent(Event):
    """Reels 1 and 2 matched. Reel 3 is being held back to manufacture tension.

    `predetermined_outcome` is already decided — the delay is pure theater.
    """

    tier: str = "normal"
    hold_ms: int = 0
    predetermined_outcome: Optional[ReelOutcome] = None


@dataclass
class SpinResolvedEvent(Event):
    outcome: ReelOutcome = ReelOutcome.MISS
    reels: tuple = field(default_factory=tuple)


@dataclass
class StateTransitionEvent(Event):
    from_state: MachineState = MachineState.NORMAL
    to_state: MachineState = MachineState.NORMAL
    silent: bool = False
    """If True, the transition is hidden from the player (e.g. KOATARI -> KAKUHEN)."""


@dataclass
class PayoutEvent(Event):
    balls: int = 0
    rounds_remaining: int = 0
