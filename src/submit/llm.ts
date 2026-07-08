/**
 * Minimal, provider-agnostic LLM call for card/source parsing.
 *
 * We deliberately keep this tiny and dependency-free (global `fetch`): it takes
 * a system + user prompt, asks for a single JSON object back, and returns it
 * parsed. Two providers are supported — Anthropic and any OpenAI-compatible
 * chat endpoint — chosen by which API key is configured (see config.llmProvider).
 *
 * This is the ONLY place the site spends AI tokens, and it's reached exclusively
 * from the SUBMIT_KEY-gated endpoints, so a random visitor can never make us pay
 * for inference.
 */
import { config, llmProvider } from '../config.js'

export class LlmUnavailableError extends Error {
  constructor() {
    super('No LLM configured')
    this.name = 'LlmUnavailableError'
  }
}

/** Pull the first `{ … }` JSON object out of a model response (handles code
 *  fences / stray prose around the JSON). Throws if none parses. */
function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1]! : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new Error('LLM returned no JSON object')
  }
  return JSON.parse(body.slice(start, end + 1)) as T
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.llm.anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.llm.anthropicModel,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  })
  if (!res.ok) {
    throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = (await res.json()) as { content?: { text?: string }[] }
  return data.content?.map((c) => c.text ?? '').join('') ?? ''
}

async function callOpenAI(system: string, user: string): Promise<string> {
  const base = config.llm.openaiBaseUrl.replace(/\/+$/, '')
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.llm.openaiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.openaiModel,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  return data.choices?.[0]?.message?.content ?? ''
}

/** Ask the configured model for a JSON object and return it parsed. Throws
 *  `LlmUnavailableError` when no provider is configured (caller falls back to
 *  the manual path). */
export async function askJson<T>(system: string, user: string): Promise<T> {
  const provider = llmProvider()
  if (!provider) throw new LlmUnavailableError()
  const raw =
    provider === 'anthropic'
      ? await callAnthropic(system, user)
      : await callOpenAI(system, user)
  return extractJson<T>(raw)
}
