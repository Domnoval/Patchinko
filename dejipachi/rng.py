"""Probability engine — the real 'physics' of a Dejipachi machine.

In a vintage Pachinko, the ball's trajectory through brass nails is the source
of randomness. Here, gravity is replaced by a typed RNG whose odds are
modulated by the hidden MachineState.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Dict

from .states import MachineState, ReelOutcome


# Symbol alphabet for the three reels. Index 7 is the "lucky" symbol — only
# matching triples produce a jackpot in the visual layer; the *real* outcome
# is decided by RNG before any reel ever spins.
SYMBOLS = tuple(range(10))
JACKPOT_SYMBOL = 7


@dataclass(frozen=True)
class SpinResult:
    outcome: ReelOutcome
    reels: tuple
    """Three integers; the visual reel result. Always consistent with `outcome`."""


@dataclass(frozen=True)
class OddsTable:
    """Inverse-probability denominators. 1/jackpot means 'one in N spins'."""

    jackpot: int = 319            # base machine — classic 1/319
    kakuhen_share: float = 0.65   # fraction of jackpots that lead into KAKUHEN
    koatari_share: float = 0.05   # fraction that are deceptive small wins
    reach_miss: int = 12          # 1/12 spins fake a Reach and miss


class ProbabilityEngine:
    """State-aware RNG. The engine never reads from the visual layer — the
    visual layer reads *from* the engine."""

    # Multipliers applied to the base jackpot rate. Larger denominator
    # (`jackpot`) means rarer; multiplier <1 makes it rarer, >1 makes it
    # easier. KAKUHEN turns 1/319 into ~1/30.
    STATE_JACKPOT_MULTIPLIER: Dict[MachineState, float] = {
        MachineState.NORMAL: 1.0,
        MachineState.KAKUHEN: 10.5,
        MachineState.JITAN: 1.0,      # JITAN speeds spins, doesn't change odds
        MachineState.KOATARI: 1.0,
        MachineState.PAYOUT: 0.0,     # cannot trigger nested jackpot mid-payout
    }

    def __init__(self, odds: OddsTable | None = None, seed: int | None = None) -> None:
        self.odds = odds or OddsTable()
        self._rand = random.Random(seed)

    # ------------------------------------------------------------------ core

    def jackpot_probability(self, state: MachineState) -> float:
        mult = self.STATE_JACKPOT_MULTIPLIER[state]
        if mult == 0.0:
            return 0.0
        return mult / self.odds.jackpot

    def spin(self, state: MachineState) -> SpinResult:
        """Decide the spin's outcome before any reels animate.

        Order of checks matters: JACKPOT first, then KOATARI sub-roll, then
        REACH_MISS theater, otherwise plain MISS.
        """
        p_jackpot = self.jackpot_probability(state)
        roll = self._rand.random()

        if roll < p_jackpot:
            # A jackpot hit. Decide its flavor.
            flavor = self._rand.random()
            if flavor < self.odds.koatari_share:
                outcome = ReelOutcome.KOATARI
            elif flavor < self.odds.koatari_share + self.odds.kakuhen_share:
                outcome = ReelOutcome.KAKUHEN_JACKPOT
            else:
                outcome = ReelOutcome.JACKPOT
            return SpinResult(outcome=outcome, reels=(JACKPOT_SYMBOL,) * 3)

        # Not a jackpot. Should we manufacture a Reach miss for theater?
        if self._rand.random() < 1 / self.odds.reach_miss:
            teaser = self._rand.choice(SYMBOLS)
            third = self._rand.choice([s for s in SYMBOLS if s != teaser])
            return SpinResult(
                outcome=ReelOutcome.REACH_MISS,
                reels=(teaser, teaser, third),
            )

        # Plain miss — first two reels deliberately differ so the player
        # never sees an unintended Reach during a miss.
        a = self._rand.choice(SYMBOLS)
        b = self._rand.choice([s for s in SYMBOLS if s != a])
        c = self._rand.choice(SYMBOLS)
        return SpinResult(outcome=ReelOutcome.MISS, reels=(a, b, c))
