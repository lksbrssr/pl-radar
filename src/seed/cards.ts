/**
 * Candidate card pool for local dev and demos.
 *
 * ~25 cards spread across the four focus areas and all content types, so a
 * monthly edition has a realistic pool to vote on (only the top ~5 by Elo make
 * it into the published Radar). In production these are replaced by the
 * ingestion pipeline (Chunk 4: Doro, PL Platform, PL Capital, focus-area leads).
 * Run `npm run seed` to load them into the current edition.
 */
import type { AngleKey } from '../types.js'

type Kind = 'internal' | 'field'
type Seed = {
  key: string
  title: string
  description: string
  href: string
  source: string
  source_kind: Kind
  type: string
  area_slug: string
  area_label: string
  external: boolean
  angle: AngleKey
  image?: string
}

const AREAS = {
  dhr: 'Digital Human Rights',
  eg: 'Economies & Governance',
  air: 'AI & Robotics',
  nt: 'Neurotech',
} as const
const SLUG: Record<keyof typeof AREAS, string> = {
  dhr: 'digital-human-rights',
  eg: 'economies-governance',
  air: 'ai-robotics',
  nt: 'neurotech',
}

function c(
  key: string,
  area: keyof typeof AREAS,
  type: string,
  title: string,
  description: string,
  source: string,
  kind: Kind,
  angle: AngleKey,
  image?: string,
): Seed {
  return {
    key,
    title,
    description,
    // Per-card demo URL so each seed card is a distinct content (a shared href
    // would collapse them all into one content via URL identity).
    href: `https://plrd.org/demo/${key}`,
    source,
    source_kind: kind,
    type,
    area_slug: SLUG[area],
    area_label: AREAS[area],
    external: kind === 'field',
    angle,
    ...(image ? { image } : {}),
  }
}

export const SAMPLE_CARDS: Seed[] = [
  // --- Digital Human Rights ---
  c('demo-chatrie', 'dhr', 'Signal', 'The Fourth Amendment now protects your location data', 'SCOTUS extends Carpenter to geofence warrants — short-term tracking is a “search.”', 'SCOTUSblog', 'field', 'clarifying'),
  c('demo-pq-encryption', 'dhr', 'Podcast', 'The fight for encryption in a post-quantum world', 'Why migrating to post-quantum crypto is a human-rights issue, not just an engineering one.', 'PL R&D', 'internal', 'provocative'),
  c('demo-zk-id', 'dhr', 'Blog', 'Zero-knowledge identity without the surveillance', 'Selective-disclosure credentials for a rights-respecting web.', 'PL R&D', 'internal', 'counterintuitive'),
  c('demo-chatcontrol', 'dhr', 'Signal', 'The EU’s “chat control” vote, explained', 'A proposed mandate to scan private messages faces a decisive parliamentary vote.', 'EDRi', 'field', 'clarifying'),
  c('demo-censorship-resistance', 'dhr', 'Publication', 'Measuring censorship resistance in content-addressed networks', 'A framework for quantifying how hard it is to take content down.', 'PL R&D', 'internal', 'proof'),
  c('demo-spyware', 'dhr', 'Signal', 'A new mercenary-spyware disclosure hits civil society', 'Researchers document targeting of journalists via a zero-click exploit.', 'Citizen Lab', 'field', 'big-if-true', 'https://picsum.photos/seed/plrd-dhr/900/600'),

  // --- Economies & Governance ---
  c('demo-onchain-cloud', 'eg', 'Publication', 'Filecoin Onchain Cloud: verifiable storage as a service', 'A developer stack for verifiable, content-addressed storage with payment rails baked in.', 'PL R&D', 'internal', 'proof'),
  c('demo-mechanism-design', 'eg', 'Publication', 'Mechanism design for decentralized compute markets', 'Incentive-compatible auctions for pricing verifiable compute on a permissionless network.', 'PL R&D', 'internal', 'clarifying'),
  c('demo-quadratic', 'eg', 'Podcast', 'Can Quadratic Funding go mainstream?', 'A $1M QF round designed to make public-goods funding legible to newcomers.', 'GreenPill', 'field', 'big-if-true'),
  c('demo-fvm', 'eg', 'Blog', 'Programmable storage lands on the FVM', 'Smart-contract-controlled storage deals go live — what builders can do now.', 'PL R&D', 'internal', 'proof'),
  c('demo-retro-funding', 'eg', 'Signal', 'Retroactive public-goods funding crosses $100M', 'Field signal: retro funding matures from experiment to standard practice.', 'Optimism', 'field', 'early-signal'),
  c('demo-stablecoin-rails', 'eg', 'Talk', 'Stablecoin rails for real-world payments', 'A talk on settlement, compliance, and where crypto payments actually work today.', 'PL R&D', 'internal', 'clarifying', 'https://picsum.photos/seed/plrd-eg/900/600'),

  // --- AI & Robotics ---
  c('demo-dexterous', 'air', 'Talk', 'Learning dexterous manipulation from a handful of demos', 'Sample-efficient imitation learning that generalizes from a few human demonstrations.', 'PL R&D', 'internal', 'proof', 'https://picsum.photos/seed/plrd-air/900/600'),
  c('demo-robot-benchmarks', 'air', 'Blog', 'Why current robot benchmarks mislead us', 'Today’s manipulation benchmarks reward overfitting — a harder, more honest suite.', 'PL R&D', 'internal', 'counterintuitive'),
  c('demo-humanoid', 'air', 'Signal', 'Humanoid robots hit the factory floor', 'First at-scale deployments and what they reveal about generalist policies.', 'IEEE Spectrum', 'field', 'early-signal'),
  c('demo-world-models', 'air', 'Publication', 'World models that plan over long horizons', 'A method for stable long-horizon planning inside learned world models.', 'PL R&D', 'internal', 'proof'),
  c('demo-open-weights', 'air', 'Signal', 'A frontier lab ships open-weight models', 'Field signal: the open-vs-closed frontier shifts again.', 'The Verge', 'field', 'provocative'),
  c('demo-eval-agents', 'air', 'Publication', 'Evaluating autonomous agents without gaming the metric', 'Robust evaluation protocols for tool-using agents.', 'PL R&D', 'internal', 'clarifying'),

  // --- Neurotech ---
  c('demo-bci-speech', 'nt', 'Signal', 'A speech BCI decodes intended words in real time', 'Restoring fluent communication for people with paralysis — and new data-rights questions.', 'Nature', 'field', 'big-if-true'),
  c('demo-neural-rights', 'nt', 'Signal', 'A first draft of a Neural Data Bill of Rights', 'A coalition proposes protections for neural data as consumer neurotech goes mainstream.', 'Neurorights Foundation', 'field', 'provocative'),
  c('demo-bci-consent', 'nt', 'Talk', 'Consent frameworks for implanted BCIs', 'Informed consent when the device writes to the brain, not just reads.', 'PL R&D', 'internal', 'clarifying'),
  c('demo-closed-loop', 'nt', 'Publication', 'Closed-loop stimulation for treatment-resistant depression', 'Results from an adaptive deep-brain-stimulation trial.', 'PL R&D', 'internal', 'proof'),
  c('demo-eeg-consumer', 'nt', 'Blog', 'What your consumer EEG headset actually measures', 'Cutting through the hype on at-home brain sensing.', 'PL R&D', 'internal', 'funny'),
  c('demo-neural-privacy', 'nt', 'Signal', 'A US state passes the first neural-privacy law', 'Field signal: neural data gets explicit legal protection for the first time.', 'STAT News', 'field', 'early-signal'),

  // --- extra cross-area to reach ~25 ---
  c('demo-agent-governance', 'eg', 'Publication', 'Governing autonomous economic agents', 'When agents transact on your behalf, who is accountable?', 'PL R&D', 'internal', 'provocative'),
]
