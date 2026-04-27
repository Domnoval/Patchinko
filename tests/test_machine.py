"""Behavioral tests: the gears must produce the engineered psychology.

These tests don't check pixel rendering — they check that the *information*
flowing out of the engine matches the design (state transitions, RNG
modulation, deceptive Koatari, manufactured Reach pacing)."""
from __future__ import annotations

from collections import Counter

import pytest

from dejipachi import DejipachiMachine, MachineConfig, MachineState
from dejipachi.events import (
    PayoutEvent,
    ReachEvent,
    SpinResolvedEvent,
    StateTransitionEvent,
)
from dejipachi.reach import ReachDirector, ReachTier
from dejipachi.rng import OddsTable, ProbabilityEngine
from dejipachi.states import EventType, ReelOutcome


# --- ProbabilityEngine ------------------------------------------------------


def test_kakuhen_dramatically_increases_jackpot_probability():
    rng = ProbabilityEngine()
    p_normal = rng.jackpot_probability(MachineState.NORMAL)
    p_kakuhen = rng.jackpot_probability(MachineState.KAKUHEN)
    assert p_kakuhen > p_normal * 5


def test_payout_state_blocks_nested_jackpots():
    rng = ProbabilityEngine()
    assert rng.jackpot_probability(MachineState.PAYOUT) == 0.0


def test_normal_jackpot_rate_matches_advertised_odds():
    rng = ProbabilityEngine(seed=0)
    jackpot_like = {
        ReelOutcome.JACKPOT,
        ReelOutcome.KAKUHEN_JACKPOT,
        ReelOutcome.KOATARI,
    }
    n = 200_000
    hits = sum(
        1 for _ in range(n)
        if rng.spin(MachineState.NORMAL).outcome in jackpot_like
    )
    expected = n / 319
    # Wide tolerance — this is a probabilistic check.
    assert 0.5 * expected < hits < 1.6 * expected


# --- ReachDirector ----------------------------------------------------------


def test_reach_skipped_for_plain_miss():
    director = ReachDirector()
    decision = director.decide(ReelOutcome.MISS, MachineState.NORMAL)
    assert decision.tier == ReachTier.NONE
    assert decision.hold_ms == 0


def test_reach_hold_compressed_during_jitan():
    import random
    director_normal = ReachDirector(random.Random(1))
    director_jitan = ReachDirector(random.Random(1))

    d_normal = director_normal.decide(ReelOutcome.JACKPOT, MachineState.NORMAL)
    d_jitan = director_jitan.decide(ReelOutcome.JACKPOT, MachineState.JITAN)
    assert d_jitan.hold_ms < d_normal.hold_ms


def test_wins_skew_toward_higher_reach_tiers():
    director = ReachDirector()
    win_tiers = Counter()
    miss_tiers = Counter()
    for _ in range(5_000):
        win_tiers[director.decide(ReelOutcome.JACKPOT, MachineState.NORMAL).tier] += 1
        miss_tiers[director.decide(ReelOutcome.REACH_MISS, MachineState.NORMAL).tier] += 1

    # Wins should produce LEGENDARY far more often than reach-misses.
    assert win_tiers[ReachTier.LEGENDARY] > miss_tiers[ReachTier.LEGENDARY] * 5


# --- DejipachiMachine -------------------------------------------------------


def collect(machine):
    log = []
    machine.on_event(log.append)
    return log


def test_start_chucker_queues_spins():
    m = DejipachiMachine(seed=1)
    m.start_chucker(balls=3)
    assert m.queued_spins == 3


def test_jackpot_triggers_payout_phase_and_returns_to_normal():
    # Force a jackpot by overriding the RNG outcome.
    m = DejipachiMachine(seed=1)
    log = collect(m)

    # Cheat: directly drive a jackpot via the resolution path.
    from dejipachi.rng import SpinResult, JACKPOT_SYMBOL
    m._present_spin(SpinResult(ReelOutcome.JACKPOT, (JACKPOT_SYMBOL,) * 3))
    m._resolve_outcome(SpinResult(ReelOutcome.JACKPOT, (JACKPOT_SYMBOL,) * 3))

    assert m.state == MachineState.PAYOUT
    m.run_until_idle()
    assert m.state == MachineState.NORMAL

    # Payout events totalling base_jackpot_balls were emitted.
    delivered = sum(
        e.balls
        for e in log
        if isinstance(e, PayoutEvent) and e.type == EventType.PAYOUT_OPEN
    )
    assert delivered == m.config.base_jackpot_balls


def test_koatari_silently_enters_kakuhen():
    m = DejipachiMachine(seed=1)
    log = collect(m)

    from dejipachi.rng import SpinResult, JACKPOT_SYMBOL
    res = SpinResult(ReelOutcome.KOATARI, (JACKPOT_SYMBOL,) * 3)
    m._present_spin(res)
    m._resolve_outcome(res)
    m.run_until_idle()

    transitions = [e for e in log if isinstance(e, StateTransitionEvent)]
    silent_to_kakuhen = [
        t for t in transitions
        if t.to_state == MachineState.KAKUHEN and t.silent
    ]
    assert silent_to_kakuhen, "Koatari must silently transition into KAKUHEN"
    assert m.state == MachineState.KAKUHEN


def test_kakuhen_decays_into_jitan_then_normal():
    m = DejipachiMachine(
        config=MachineConfig(kakuhen_spins=3, jitan_spins_after_kakuhen=3),
        seed=1,
    )
    # Force entry into KAKUHEN.
    from dejipachi.rng import SpinResult, JACKPOT_SYMBOL
    res = SpinResult(ReelOutcome.KAKUHEN_JACKPOT, (JACKPOT_SYMBOL,) * 3)
    m._present_spin(res)
    m._resolve_outcome(res)
    m.run_until_idle()
    assert m.state == MachineState.KAKUHEN

    # Now feed plain misses and watch it decay.
    # Patch the RNG to always miss so we don't accidentally re-trigger.
    from dejipachi.rng import SpinResult as _SR
    misses_in_a_row = [
        _SR(ReelOutcome.MISS, (0, 1, 2)) for _ in range(20)
    ]
    miss_iter = iter(misses_in_a_row)
    m._rng.spin = lambda state: next(miss_iter)  # type: ignore[assignment]

    m.start_chucker(balls=20)
    m.run_until_idle()
    assert m.state == MachineState.NORMAL


def test_reach_event_precedes_spin_resolution():
    m = DejipachiMachine(seed=1)
    log = collect(m)

    from dejipachi.rng import SpinResult
    res = SpinResult(ReelOutcome.REACH_MISS, (5, 5, 9))

    # Loop until ReachDirector picks a non-NONE tier — then verify ordering.
    for _ in range(50):
        log.clear()
        m._present_spin(res)
        reach_events = [e for e in log if isinstance(e, ReachEvent)]
        spin_events = [e for e in log if isinstance(e, SpinResolvedEvent)]
        if reach_events:
            assert log.index(reach_events[0]) < log.index(spin_events[0])
            return
    pytest.fail("ReachDirector never picked a Reach tier in 50 attempts")
