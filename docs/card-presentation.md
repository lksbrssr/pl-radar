# Substance vs. presentation — things to consider

Working notes for separating **what we cover** (content sources) from **how we
show it** (cards), and for the AI-assisted card studio we've postponed. Not a
spec — a thinking doc to argue with.

---

## 1. The core reframe

Today "a source produces a card" is 1:1 — one blog post becomes one card. The
idea here is to split that into **two layers**:

- **Substance / Content** — the canonical thing that happened: a talk, a post, a
  paper, a signal. Pulled from a source; factual; deduplicated; stable.
- **Presentation / Cards** — editorial *renderings* of that content for the
  Radar. **Many cards per content.** A quote card, an image-led card, a
  provocative take, a plain informative summary — all pointing at the same
  underlying thing.

> A card is not the content. A card is *a way of showing* the content.

Why this matters: it lets us optimize presentation independently of coverage. We
can ask two different questions — "is this content worth surfacing?" and "what's
the best way to present it?" — and the crowd can help answer both.

---

## 2. Content → cards is 1:N (and sometimes N:1)

- **1 content → N cards:** the common case. 2–3 cards per blog post, each a
  different "cut."
- **N content → 1 card:** synthesis. Combine the two BCI talks into one "state
  of neurotech" narrative card. Provenance then references multiple contents.
- **0 content → 1 card:** rare, editorial (a themed intro card). Probably out of
  scope for v1.

Data-model implication: a card references one *or more* content ids, plus its own
presentation metadata. Content is the source of truth for facts; the card owns
copy, framing, and media choices.

> The same real thing often arrives from **multiple sources** (a talk cross-posted
> on plrd.org *and* plneuro.xyz with different titles). Collapsing those into one
> Content is a prerequisite for this whole layer — see §11 (Deduplication).

```
Content (substance)                 Card (presentation)
  id, url, title,        1 ── N       id, content_ids[],
  body/transcript,      ───────►      archetype, tone vector,
  images[], date,                     headline, blurb, quote,
  people, topic                       image_ref, angle, edition
```

---

## 3. The "feel" of a card as a vector (the preference slider)

You described a slider for what a card should feel like. Concretely, a card's
character is a small set of dials:

| Dial | Low ⟷ High | Notes |
|---|---|---|
| **Tone** | informative ⟷ provocative | the emotional temperature |
| **Density** | snippet/quote ⟷ full explainer | how much it says |
| **Media weight** | text-first ⟷ image-first | hero image vs. words |
| **Abstraction** | concrete/proof ⟷ big-picture/"big if true" | |
| **Length** | glanceable ⟷ read | headline-only vs. paragraph |

These map cleanly onto taxonomy we **already have** in `src/types.ts`:

- **Angle** (`ANGLES`) already encodes the hook: `counterintuitive`,
  `big-if-true`, `early-signal`, `provocative`, `funny`, `clarifying`, `proof`.
  That *is* the tone/abstraction dial, already modeled and already measured by
  the part-worth analysis.
- **Type** (`Talk/Podcast/Publication/Blog/Signal`) is a coarse format dial.
- **Focus area** is the topic, orthogonal to presentation.

So the "slider" isn't new machinery so much as **making the existing angle (and a
couple of new presentation attributes like media-weight/density) into a target we
generate toward**, instead of something we passively infer.

---

## 4. Archetypes = named presets in slider-space

Rather than expose raw sliders first, offer a few **archetypes** (each is just a
preset point in the vector, mapped to one layout template):

| Archetype | Feel | Pulls from content | Angle default |
|---|---|---|---|
| **Quote** | punchy, human | best pull-quote + speaker | provocative / funny |
| **Proof** | credible, concrete | the result/finding + a number | proof |
| **Provocation** | spiky, opinionated | the contrarian claim | provocative / counterintuitive |
| **Explainer** | clear, useful | the "what & why it matters" | clarifying |
| **Hero / Visual** | image-led, atmospheric | strongest image + short line | early-signal |
| **Synthesis** | connective, thematic | across multiple contents | big-if-true |

Advanced users can then nudge the dials off a preset. AI can even *suggest* which
archetypes suit a given content (a data-heavy post → Proof; a charismatic talk →
Quote).

---

## 5. This collides with the voting/ranking model — on purpose

If one post spawns 3 cards and they all enter the pool, they compete against each
other and everything else. That creates real questions:

- **Vote splitting / cannibalization** — three variants of the same content may
  split the vote and each look weaker than the content "deserves."
- **Pool flooding** — a prolific source or an over-eager generator could swamp
  the pool with near-duplicates and fatigue voters.
- **Duplicate fatigue** — seeing the same underlying thing three times in a
  voting session feels repetitive.

But there's a **feature hiding in here**: if variants of the same content compete,
the crowd is no longer only ranking *content* — it's ranking **content ×
presentation**. You learn *which framing wins*, per segment. The part-worth model
already decomposes preference by angle/type/source; extend it with presentation
attributes and you get "capital investors prefer Proof cards; comms prefers
Provocation" — directly actionable for how to present future content.

Options to manage the collision (pick one, or combine):

1. **Variant playoff first.** Cards from one content run an internal
   king-of-the-hill; only the winning variant enters the main pool. Clean pool,
   but you throw away the cross-framing signal.
2. **Family-aware sampling.** Let variants into the pool but never show two cards
   from the same content in the same match-up, and cap how often a family
   appears. Keeps the signal, controls fatigue. (Fits the existing least-seen
   sampler.)
3. **Per-content / per-source caps** on how many cards reach the pool or the cut.
4. **Two-stage:** crowd ranks content strength *and* framing preference
   separately.

Recommendation to explore: **option 2** — it preserves the "which presentation
wins" signal, which is the whole point of separating the layers, while a family
cap and a no-sibling-pairs rule handle fatigue and cannibalization.

---

## 6. Brand coherence despite variety

Variety in *feel* must not fragment the *brand*. The way you get "many moods, one
voice" is **constraints, not freedom**:

- **A card grammar, not a canvas.** A small fixed set of layout templates (one
  per archetype), shared typography, shared spacing, focus-area color tokens, and
  a consistent image treatment (plrd.org already gradient-overlays its
  thumbnails — reuse that). Sliders move *within* these rails.
- **Voice guardrails.** Even a "provocative" card stays in the PL R&D voice.
  Codify a short style guide (do/don't, sentence length, no hype words) and feed
  it to the generator as system prompt + a few gold-standard exemplars
  (few-shot). Brand consistency comes mostly from good exemplars.
- **Finite templates.** Resist infinite layouts. 5–6 templates covering the
  archetypes is plenty and keeps the Radar recognizable.
- **One image language.** Consistent aspect ratio, overlay, and fallback so an
  image-led card and a quote card still feel like siblings.

Rule of thumb: the *content* varies wildly, the *frame* barely varies. That
contrast is what reads as "a brand."

---

## 7. Composing the final Radar (the "a few of each" problem)

You want the shipped Radar to have a *spread* — a few of each archetype/mood —
but still feel like one coherent digest, not just "top 5 by score." That's a
**composition layer on top of ranking**, like sequencing a playlist or an album:

- Pure top-N by crowd score optimizes strength but can yield a monotonous set
  (five Proof cards, all AI & Robotics).
- Add **diversity/quota constraints** to the cut: aim for a spread across focus
  areas, archetypes, and tones while respecting rank (a "diverse top-N" / MMR-style
  selection).
- Keep the tension explicit and deliberate: **the crowd decides what's strong;
  the composition layer assembles a balanced, on-brand set from the strong pool.**
  Editors (or an algorithm with these constraints) own the final sequencing.

Open question: how much editorial control vs. pure crowd outcome? A good default
is "crowd filters to a strong shortlist, composition picks a balanced 5 from it,"
so the Radar is always both *earned* and *coherent*.

---

## 8. Where AI actually fits

AI is a **variant generator and copy drafter**, bounded by the style guide and
the slider/archetype params — not an autopublisher:

- Input: selected content (ideally full body/transcript, not just titles),
  archetype + dials, and the instruction.
- Output: draft cards (headline, blurb, quote, suggested image, angle) — written
  nothing until a human reviews.
- Human-in-the-loop: edit inline, accept/reject, then commit to the pool with
  provenance (which content, which prompt/params, which model, human-edited flag).
- Feedback loop: vote outcomes on presentation attributes tune future generation
  ("Provocation underperforms for researchers → generate fewer of those there").

The value of separating the layers is that AI operates purely in the presentation
layer — it never invents substance, only reframes verified content.

---

## 9. Decisions to make (when we pick this back up)

1. **Do variants compete directly, or run a per-content playoff first?**
   (Recommend: compete, but family-aware — §5 option 2.)
2. **Caps:** max cards per content? per source? per edition?
3. **Is presentation-preference a signal we want to capture and act on?** If yes,
   variants *should* coexist so the part-worth model can decompose framing.
4. **How many layout templates / archetypes do we commit to for v1?**
5. **Who owns final composition** — crowd score, editor, or algorithm with
   diversity constraints? How many "of each" is the target?
6. **Synthesis cards:** how do we show provenance/attribution when one card spans
   multiple contents?
7. **Content depth for AI:** transcripts + full text (richer, more plumbing) vs.
   title + description + excerpt (cheaper, shallower)?
8. **Dedup precedence (§11):** when two sources carry the same talk, which is
   canonical, and do we merge best-of fields or just pick one?

---

## 10. Suggested build order

1. **Content layer as its own thing, with dedup.** Persist ingested items as
   *Content* (not directly as cards), with body/images where available, and
   resolve identity on the way in (§11) so cross-posts collapse to one Content.
   Substance becomes addressable, deduplicated, and reusable. *(Foundational —
   unlocks everything else.)*
2. **Manual 1:N.** Let an admin hand-make multiple cards from one content with
   the archetype presets + templates. Proves the model and the brand grammar
   with zero AI.
3. **AI drafting.** Add the generator on top of the same review→commit flow.
4. **Family-aware sampling + composition.** Teach the sampler and the cut about
   card families and diversity once there are enough variants to matter.

Doing (1) and (2) first means the AI studio is "just" an accelerator for a flow
that already works by hand — much easier to trust and to keep on-brand.

---

## 11. Content identity & deduplication (the plneuro.xyz problem)

**Worked example (real, June 2026).** plneuro.xyz cross-posts the same Juan Benet
Podcast talks as plrd.org, with *different* titles, images, and descriptions:

| plrd.org | plneuro.xyz | Same? |
|---|---|---|
| "Konrad Kording — …a Path to Simulating the Brain" | "Konrad Kording — …and Simulating…" | ✅ YouTube `FHQfmJEpRmU` on both |
| "Tom Oxley — Reading the Brain Without Opening the Skull" | "Tom Oxley — BCI Without Opening the Skull…" | ✅ YouTube `0gvHqRv8gTg` on both |

Same substance, different presentation, different source — exactly the case the
Content layer must resolve. If we naively ingest both sources, the pool gets two
near-duplicate cards per talk that split votes and bore voters.

**Key insight:** the titles *don't* match 1:1, but the underlying identifier
does. So dedup is a **layered pipeline**, cheap-and-precise first, AI last — not
"throw AI at everything."

### The layers (cheap → expensive)

1. **Canonical identifiers (deterministic, do this first).** Extract a strong id
   and dedupe on it:
   - **YouTube video id** for talks/podcasts — *this alone catches both June dups
     above.*
   - **Normalized canonical URL** (strip `utm_*`, trailing slash, host aliases,
     `www`).
   - **DOI / arXiv id** for papers.
   High precision, free, no model. Most PL cross-posting points at the same
   video/paper, so this does the heavy lifting.
2. **Blocking (candidate generation).** For items with *no* shared id, don't
   compare everything to everything. Bucket by `publish-month × focus-area ×
   normalized name/speaker tokens` and only compare within a bucket.
3. **Fuzzy match (heuristic).** Inside a block: normalized-title similarity
   (token Jaccard / trigram), publish date within ±N days, shared named entities.
   High → duplicate; low → distinct; middle → escalate.
4. **Embeddings (semantic).** Embed `title + description`; cosine similarity
   catches paraphrases that share few tokens ("Reading the Brain Without Opening
   the Skull" vs "BCI Without Opening the Skull"). A threshold gates the next step.
5. **LLM adjudication (the actual AI part).** Only for the residual ambiguous
   pairs: ask "do these describe the same underlying talk/paper/event — same,
   related, or distinct?" Cheap because it runs on *few* pairs. This is where
   genuinely non-1:1 cases resolve: a written recap of a talk, two posts on the
   same announcement.

### Output: canonical Content

Each cluster of source-items resolves to one **Content** with:
- a stable content id,
- **merged best-of metadata** (richest description, best/highest-res image,
  canonical URL),
- **all source provenances retained** (plrd *and* plneuro both listed — useful
  attribution and a signal of importance),
- **precedence rules** for conflicts (e.g., primary publisher's title wins; a
  neurotech-focused source may contribute a better neurotech framing as a field).

### Decisions this raises

- **Dedup at the substance layer, never the card layer.** Accidental cross-post
  dupes must collapse to one Content *before* we deliberately fan out into
  presentation variants (§2). Don't let a dup masquerade as a "variant."
- **Source precedence:** when plrd and plneuro both carry a talk, who is
  canonical? (Likely plrd as primary; keep plneuro's framing as extra signal.)
- **Merge vs. suppress:** keep both source rows as provenance and surface one
  Content (recommended), or hard-drop the duplicate?
- **Human override:** a small review queue for borderline LLM calls — cheap,
  because so few pairs reach layer 5.

### Practical implication for right now

We should **not** add plneuro.xyz as a third source until at least layer 1
(YouTube-id / canonical-URL dedup) exists — otherwise June instantly gains two
duplicate cards. Layer 1 is deterministic and testable and would let us safely
add plneuro (and future overlapping/neurotech field feeds) without flooding the
pool. Layers 4–5 (embeddings + LLM) can wait until we hit real non-1:1 overlap.
