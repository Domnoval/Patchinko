"""Demo runner: drive the machine with a stream of start-chucker triggers and
print the resulting event log so the engineered pacing is visible."""
from __future__ import annotations

from dejipachi import (
    DejipachiMachine,
    MachineConfig,
    MachineState,
)
from dejipachi.events import (
    PayoutEvent,
    ReachEvent,
    SpinResolvedEvent,
    StartChuckerEvent,
    StateTransitionEvent,
)
from dejipachi.states import EventType


def format_event(e) -> str:
    t = f"t={e.tick:>4}"
    if isinstance(e, StartChuckerEvent):
        return f"{t}  CHUCKER       queue={e.spins_queued}"
    if isinstance(e, ReachEvent):
        return (
            f"{t}  REACH         tier={e.tier:<10} hold={e.hold_ms:>5}ms "
            f"-> outcome will be {e.predetermined_outcome.name}"
        )
    if isinstance(e, SpinResolvedEvent):
        return f"{t}  SPIN          reels={e.reels} outcome={e.outcome.name}"
    if isinstance(e, StateTransitionEvent):
        tag = "  [SILENT]" if e.silent else ""
        return f"{t}  STATE         {e.from_state.name} -> {e.to_state.name}{tag}"
    if isinstance(e, PayoutEvent):
        if e.type == EventType.PAYOUT_OPEN:
            return f"{t}  PAYOUT        +{e.balls:>3} balls (remaining {e.rounds_remaining})"
        return f"{t}  PAYOUT_CLOSE"
    return f"{t}  {e}"


def main() -> None:
    machine = DejipachiMachine(
        config=MachineConfig(),
        seed=42,  # deterministic demo
    )
    machine.on_event(lambda e: print(format_event(e)))

    # Simulate ~2000 start-chucker triggers — roughly an evening of play.
    machine.start_chucker(balls=2000)
    machine.run_until_idle()

    print()
    print(f"Final state: {machine.state.name}")


if __name__ == "__main__":
    main()
