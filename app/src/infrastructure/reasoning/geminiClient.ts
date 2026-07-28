/**
 * Minimal Gemini REST client shared by GeminiReasoningEngine and
 * GeminiSchemaReasoningEngine. No SDK dependency — one fetch() call against the public
 * generateContent endpoint, asking for JSON output. Kept deliberately small: this is the
 * one place that knows Gemini's request/response shape, so a future model swap (a newer
 * Gemini version, or a different provider entirely) only touches this file plus the two
 * engine classes that call it.
 */

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export class GeminiConfigError extends Error {}
export class GeminiRequestError extends Error {}

/** Calls Gemini with a system+user prompt pair, asking for raw JSON text back. */
export async function callGeminiForJson(apiKey: string, systemInstruction: string, userPrompt: string): Promise<unknown> {
  if (!apiKey) {
    throw new GeminiConfigError('No Gemini API key configured. Add one in Settings to use live AI generation.');
  }

  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new GeminiRequestError(`Gemini request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiRequestError('Gemini returned no content.');

  try {
    return JSON.parse(stripMarkdownFence(text));
  } catch {
    throw new GeminiRequestError('Gemini returned non-JSON output that could not be parsed.');
  }
}

/** Calls Gemini with a system+user prompt pair, asking for plain prose back (no JSON mode). */
export async function callGeminiForText(apiKey: string, systemInstruction: string, userPrompt: string): Promise<string> {
  if (!apiKey) {
    throw new GeminiConfigError('No Gemini API key configured. Add one in Settings to use live AI generation.');
  }

  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.4 },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new GeminiRequestError(`Gemini request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiRequestError('Gemini returned no content.');
  return text.trim();
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}
