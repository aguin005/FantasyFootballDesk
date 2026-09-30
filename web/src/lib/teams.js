/**
 * The 32 teams by the abbreviations the schedule uses, which are ESPN's. Sleeper
 * writes Washington as WAS and nflverse writes the Rams as LA, so both pass
 * through teamCode first.
 */
const TEAMS = {
  ARI: ['Arizona', 'Cardinals'],
  ATL: ['Atlanta', 'Falcons'],
  BAL: ['Baltimore', 'Ravens'],
  BUF: ['Buffalo', 'Bills'],
  CAR: ['Carolina', 'Panthers'],
  CHI: ['Chicago', 'Bears'],
  CIN: ['Cincinnati', 'Bengals'],
  CLE: ['Cleveland', 'Browns'],
  DAL: ['Dallas', 'Cowboys'],
  DEN: ['Denver', 'Broncos'],
  DET: ['Detroit', 'Lions'],
  GB: ['Green Bay', 'Packers'],
  HOU: ['Houston', 'Texans'],
  IND: ['Indianapolis', 'Colts'],
  JAX: ['Jacksonville', 'Jaguars'],
  KC: ['Kansas City', 'Chiefs'],
  LAC: ['Los Angeles', 'Chargers'],
  LAR: ['Los Angeles', 'Rams'],
  LV: ['Las Vegas', 'Raiders'],
  MIA: ['Miami', 'Dolphins'],
  MIN: ['Minnesota', 'Vikings'],
  NE: ['New England', 'Patriots'],
  NO: ['New Orleans', 'Saints'],
  NYG: ['New York', 'Giants'],
  NYJ: ['New York', 'Jets'],
  PHI: ['Philadelphia', 'Eagles'],
  PIT: ['Pittsburgh', 'Steelers'],
  SEA: ['Seattle', 'Seahawks'],
  SF: ['San Francisco', '49ers'],
  TB: ['Tampa Bay', 'Buccaneers'],
  TEN: ['Tennessee', 'Titans'],
  WSH: ['Washington', 'Commanders']
}

const ALIASES = { WAS: 'WSH', LA: 'LAR', JAC: 'JAX', SD: 'LAC', OAK: 'LV', STL: 'LAR' }

export function teamCode(team) {
  return ALIASES[team] || team
}

/** "Bills". Unknown codes come back as they are. */
export function teamNickname(team) {
  return TEAMS[teamCode(team)]?.[1] || team
}

/** "Buffalo Bills", for screen readers and tooltips. */
export function teamFullName(team) {
  const entry = TEAMS[teamCode(team)]
  return entry ? `${entry[0]} ${entry[1]}` : team
}

/** ESPN's logo, and its version drawn for dark backgrounds, where the Raiders' black shield would vanish. */
export function teamLogos(team) {
  const code = teamCode(team).toLowerCase()
  return {
    light: `https://a.espncdn.com/i/teamlogos/nfl/500/${code}.png`,
    dark: `https://a.espncdn.com/i/teamlogos/nfl/500-dark/${code}.png`
  }
}
