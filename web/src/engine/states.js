// Hidden software states. The player's perceived "luck" is a transition
// between these — the physical ball is just a binary trigger.
export const MachineState = Object.freeze({
  NORMAL:  'NORMAL',
  KAKUHEN: 'KAKUHEN',
  JITAN:   'JITAN',
  KOATARI: 'KOATARI',
  PAYOUT:  'PAYOUT',
});

export const ReelOutcome = Object.freeze({
  MISS:             'MISS',
  REACH_MISS:       'REACH_MISS',
  JACKPOT:          'JACKPOT',
  KAKUHEN_JACKPOT:  'KAKUHEN_JACKPOT',
  KOATARI:          'KOATARI',
});

export const EventType = Object.freeze({
  START_CHUCKER:     'START_CHUCKER',
  REACH:             'REACH',
  SPIN_RESOLVED:     'SPIN_RESOLVED',
  STATE_TRANSITION:  'STATE_TRANSITION',
  PAYOUT_OPEN:       'PAYOUT_OPEN',
  PAYOUT_CLOSE:      'PAYOUT_CLOSE',
});
