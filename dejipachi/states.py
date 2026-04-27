"""Internal state machine for the Dejipachi informational engine.

The physical ball is a binary trigger; everything that *matters* lives here as
typed states the player never directly observes.
"""
from __future__ import annotations

from enum import Enum, auto


class MachineState(Enum):
    """Hidden software states that replace the role of mechanical 'tulips'.

    The player's perceived "luck" is really a transition between these states.
    """

    NORMAL = auto()
    """Base odds. Long, slow spins. The default grind."""

    KAKUHEN = auto()
    """Probability-change loop. Jackpot odds drastically multiplied; the
    player is unaware they are inside a high-probability window."""

    JITAN = auto()
    """Time-reduction. Reels spin much faster and the digital start gate
    widens — more triggers per minute, less idle dead time."""

    KOATARI = auto()
    """Small/deceptive jackpot. A brief flash of payout that secretly
    transitions the machine into KAKUHEN without telegraphing the change."""

    PAYOUT = auto()
    """The 'Attacker' gate is open. Continuous ball influx into the tray —
    a hypnotic feedback loop intended to anchor the win memory."""


class ReelOutcome(Enum):
    """Outcome category for a single RNG spin, before presentation."""

    MISS = auto()
    REACH_MISS = auto()           # two reels match, third misses (manufactured tension, no payout)
    JACKPOT = auto()              # standard big win
    KAKUHEN_JACKPOT = auto()      # win that transitions into probability-change
    KOATARI = auto()              # deceptive small jackpot, secret KAKUHEN entry


class EventType(Enum):
    START_CHUCKER = auto()
    SPIN_BEGIN = auto()
    REACH = auto()
    SPIN_RESOLVED = auto()
    STATE_TRANSITION = auto()
    PAYOUT_OPEN = auto()
    PAYOUT_CLOSE = auto()
