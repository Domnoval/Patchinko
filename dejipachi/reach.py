"""The synthetic-tension algorithm.

In a vintage Pachinko, tension is emergent: a steel ball wobbles near a hole
and gravity decides. In a Dejipachi, the RNG has *already decided* the
outcome — so tension must be deployed deliberately, after the fact, as
calculated theater.

This module's job: given a predetermined SpinResult, choose how long to hold
reel 3 and which dramatic 'tier' of animation to request from the frontend.
The longer the hold, the higher the player's invested expectation. That
investment is the actual product the machine sells.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from enum import Enum, auto
from typing import Optional

from .states import MachineState, ReelOutcome


class ReachTier(Enum):
    """Escalating presentation tiers. Each tier ratchets the player's hope.

    The frontend maps these to specific animations (cut-ins, character
    battles, screen takeovers). The engine just declares the tier.
    """

    NONE = auto()
    NORMAL = auto()       # short hold, basic slowdown
    SUPER = auto()        # extended hold + cut-in animation
    PREMIUM = auto()      # 'battle' / character sequence, long hold
    LEGENDARY = auto()    # screen takeover, multi-stage; near-guaranteed win signal


@dataclass(frozen=True)
class ReachDecision:
    tier: ReachTier
    hold_ms: int
    """How long reel 3 is frozen before the predetermined outcome is shown."""
    predetermined_outcome: ReelOutcome


class ReachDirector:
    """Decides the tier and duration of the manufactured delay.

    The hit-rate-by-tier table is the gear. By making LEGENDARY *usually*
    end in a win and NORMAL *usually* end in a miss, the visual escalation
    becomes a credible (but engineered) probability signal — exactly the
    psychological lever vintage tulip flippers couldn't pull.
    """

    # P(tier | outcome). For wins we bias toward higher tiers; for
    # reach-misses we bias toward lower tiers but still occasionally show
    # a LEGENDARY false alarm to keep the high tiers ambiguous.
    WIN_TIER_WEIGHTS = {
        ReachTier.NORMAL: 0.10,
        ReachTier.SUPER: 0.25,
        ReachTier.PREMIUM: 0.35,
        ReachTier.LEGENDARY: 0.30,
    }
    MISS_TIER_WEIGHTS = {
        ReachTier.NORMAL: 0.70,
        ReachTier.SUPER: 0.20,
        ReachTier.PREMIUM: 0.08,
        ReachTier.LEGENDARY: 0.02,  # the rare 'gut-punch' false alarm
    }

    HOLD_MS_BY_TIER = {
        ReachTier.NORMAL: 1_500,
        ReachTier.SUPER: 4_500,
        ReachTier.PREMIUM: 9_000,
        ReachTier.LEGENDARY: 18_000,
    }

    # JITAN compresses every dramatic beat — speed is the whole point of the state.
    JITAN_HOLD_MULTIPLIER = 0.4

    def __init__(self, rand: Optional[random.Random] = None) -> None:
        self._rand = rand or random.Random()

    def decide(self, outcome: ReelOutcome, state: MachineState) -> ReachDecision:
        """Return the tension package for a spin, or NONE if no Reach applies."""
        if outcome in (ReelOutcome.MISS,):
            return ReachDecision(ReachTier.NONE, 0, outcome)

        if outcome in (ReelOutcome.JACKPOT, ReelOutcome.KAKUHEN_JACKPOT, ReelOutcome.KOATARI):
            tier = self._weighted_tier(self.WIN_TIER_WEIGHTS)
        else:  # REACH_MISS — pure theater, no payout
            tier = self._weighted_tier(self.MISS_TIER_WEIGHTS)

        hold = self.HOLD_MS_BY_TIER[tier]
        if state == MachineState.JITAN:
            hold = int(hold * self.JITAN_HOLD_MULTIPLIER)

        return ReachDecision(tier=tier, hold_ms=hold, predetermined_outcome=outcome)

    # ----------------------------------------------------------------- internal

    def _weighted_tier(self, weights: dict) -> ReachTier:
        tiers, w = zip(*weights.items())
        return self._rand.choices(tiers, weights=w, k=1)[0]
