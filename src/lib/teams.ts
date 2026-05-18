export type TeamConfig = {
  slug: string
  name: string
  mainAccount: { name: string; tag: string; region: string }
  roster: Record<string, string> // "RiotName#Tag" → display_name
}

export const TEAM_CONFIGS: Record<string, TeamConfig> = {
  scylla: {
    slug: 'scylla',
    name: 'SOP Scylla',
    mainAccount: { name: 'MAK', tag: '1103', region: 'ap' },
    roster: {
      'Igawr#xuu许': 'Igawr',
      'MAK#1103': 'MAK',
      'Scooby dooby doo#benjy': 'Benjy',
      'Yaki#hers': 'Yaki',
      'EPIC#bhop': 'EPIC',
      'XkOr#APAC': 'XKoR',
      'MapleSyrup#soon': 'MapleSyrup',
      'Dusk#tort': 'Dusk',
    },
  },
  hydra: {
    slug: 'hydra',
    name: 'SOP Hydra (Academy)',
    mainAccount: { name: 'Trippie', tag: '0114', region: 'ap' },
    roster: {
      'Trippie#0114': 'Trippie',
      'Gin#0114': 'Gin',
      'default#aimy': 'default',
      'Ark#VCSA': 'Ark',
      'dukeeww#kvck': 'dukeeww',
      'S one#VCT': 'S one',
    },
  },
}
