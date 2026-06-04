export const SCORING = {
  // Base points per correct guess type
  guessTitle: 100,
  guessArtist: 150,

  // Placement bonus for guesser — index 0 = 1st correct, index 1 = 2nd, etc.
  // Beyond the array length: +0 bonus
  placementBonus: [100, 75, 50, 25] as readonly number[],

  // Speed bonus on top, scales linearly with time remaining
  maxSpeedBonus: 50,
  roundDuration: 60, // seconds

  // Singer receives per recognising player
  singerTitleRecognized: 75,
  singerArtistRecognized: 100,

  // Singer placement bonus — index 0 = 1st guesser, index 1 = 2nd, beyond = +0
  singerPlacementBonus: [50, 25] as readonly number[],

  // Local buzzer mode — manual judging by singer, no placement/speed bonus
  localMode: {
    guessTitle: 200,
    guessArtist: 250,
    singerTitleSolved: 100,
    singerArtistSolved: 125,
  },
} as const;
