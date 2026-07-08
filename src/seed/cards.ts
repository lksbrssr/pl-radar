/**
 * Sample candidate cards for local development and first-run demos.
 *
 * A mix of PL R&D outputs and external "field signals" across all four focus
 * areas, so a fresh install has something to vote on immediately. In production
 * these will be replaced by the ingestion pipeline (Chunk 4: Doro, PL Platform,
 * PL Capital, focus-area leads). Run `npm run seed` to load them.
 */
export const SAMPLE_CARDS = [
  {
    key: 'demo-chatrie-scotus',
    title: 'The Fourth Amendment now protects your location data',
    description:
      'In Chatrie v. United States, the Supreme Court held that people have a reasonable expectation of privacy in location data revealing their movements — a landmark extension of Carpenter reaching geofence warrants.',
    href: 'https://www.scotusblog.com/',
    source: 'SCOTUSblog',
    source_kind: 'field' as const,
    type: 'Signal',
    area_slug: 'digital-human-rights',
    area_label: 'Digital Human Rights',
    external: true,
  },
  {
    key: 'demo-fil-onchain-cloud',
    title: 'Filecoin Onchain Cloud: verifiable storage as a service',
    description:
      'A walkthrough of the new developer stack for building apps on verifiable, content-addressed storage with payment rails baked in.',
    href: 'https://filecoin.io/',
    source: 'PL R&D',
    source_kind: 'internal' as const,
    type: 'Publication',
    area_slug: 'economies-governance',
    area_label: 'Economies & Governance',
    external: false,
  },
  {
    key: 'demo-robotics-manipulation',
    title: 'Learning dexterous manipulation from a handful of demos',
    description:
      'A talk on sample-efficient imitation learning that gets robot hands to generalize from just a few human demonstrations.',
    href: 'https://www.youtube.com/',
    source: 'PL R&D',
    source_kind: 'internal' as const,
    type: 'Talk',
    area_slug: 'ai-robotics',
    area_label: 'AI & Robotics',
    external: false,
    image: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  },
  {
    key: 'demo-neurotech-bci-speech',
    title: 'A speech BCI that decodes intended words in real time',
    description:
      'New results on a brain-computer interface restoring fluent communication for people with paralysis, with open questions on neural-data rights.',
    href: 'https://www.nature.com/',
    source: 'Nature',
    source_kind: 'field' as const,
    type: 'Signal',
    area_slug: 'neurotech',
    area_label: 'Neurotech',
    external: true,
  },
  {
    key: 'demo-econ-mechanism-design',
    title: 'Mechanism design for decentralized compute markets',
    description:
      'A paper proposing incentive-compatible auctions for pricing verifiable compute across a permissionless network.',
    href: 'https://arxiv.org/',
    source: 'PL R&D',
    source_kind: 'internal' as const,
    type: 'Publication',
    area_slug: 'economies-governance',
    area_label: 'Economies & Governance',
    external: false,
  },
  {
    key: 'demo-dhr-privacy-podcast',
    title: 'Podcast: the fight for encryption in a post-quantum world',
    description:
      'A conversation on why migrating to post-quantum cryptography is a human-rights issue, not just an engineering one.',
    href: 'https://open.spotify.com/',
    source: 'PL R&D',
    source_kind: 'internal' as const,
    type: 'Podcast',
    area_slug: 'digital-human-rights',
    area_label: 'Digital Human Rights',
    external: false,
  },
  {
    key: 'demo-airobotics-eval',
    title: 'Why current robot benchmarks mislead us',
    description:
      'A blog post arguing that today’s manipulation benchmarks reward overfitting and proposing a harder, more honest evaluation suite.',
    href: 'https://example.org/robot-eval',
    source: 'PL R&D',
    source_kind: 'internal' as const,
    type: 'Blog',
    area_slug: 'ai-robotics',
    area_label: 'AI & Robotics',
    external: false,
  },
  {
    key: 'demo-neurotech-datarights',
    title: 'A first draft of a Neural Data Bill of Rights',
    description:
      'Field signal: a coalition publishes proposed protections for neural data as consumer neurotech goes mainstream.',
    href: 'https://example.org/neural-rights',
    source: 'Neurorights Foundation',
    source_kind: 'field' as const,
    type: 'Signal',
    area_slug: 'neurotech',
    area_label: 'Neurotech',
    external: true,
  },
]
