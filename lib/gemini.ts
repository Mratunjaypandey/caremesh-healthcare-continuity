import 'server-only';

import { z } from 'zod';

/**
 * CareMesh AI uses the public Gemini generateContent REST endpoint.
 * We deliberately keep the API key server-side and use a small model
 * cascade so a temporary capacity spike on one model does not break
 * the patient assistant.
 *
 * Google documents generateContent at:
 * POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * and recommends exponential backoff for transient 429 / 5xx responses.
 */

const primaryModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash';
const fallbackModels = (
  process.env.GEMINI_FALLBACK_MODELS?.trim() ||
  'gemini-3.5-flash,gemini-3.5-flash-lite,gemini-2.5-flash-lite'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS_PER_MODEL = 2;

export class GeminiUnavailableError extends Error {
  readonly retryable = true;
  constructor(message: string) {
    super(message);
    this.name = 'GeminiUnavailableError';
  }
}

export class GeminiConfigurationError extends Error {
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = 'GeminiConfigurationError';
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function modelsToTry() {
  return Array.from(new Set([primaryModel, ...fallbackModels]));
}

const systemInstruction = `
You are CareMesh AI, a private healthcare continuity and record-navigation assistant.

SAFETY BOUNDARY
- You are not a doctor.
- Never diagnose.
- Never prescribe or change medication.
- Never provide dosage instructions.
- Never provide emergency triage.
- Never infer an undiagnosed condition from a test or symptom.
- Explain and organize only the supplied CareMesh record.
- If clinical advice is requested, clearly recommend contacting the patient's qualified clinician.
- Never reveal another patient's information.
- Never invent appointments, documents, medicines, diagnoses, clinicians, or events.
- Prefer plain language suitable for a patient.
`;

export const careSummarySchema = z.object({
  headline: z.string(),
  overview: z.string(),
  timeline_highlights: z.array(
    z.object({
      date: z.string(),
      title: z.string(),
      summary: z.string(),
      source_event_ids: z.array(z.string()),
    }),
  ),
  continuity_gaps: z.array(
    z.object({
      type: z.string(),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
      description: z.string(),
      source_event_ids: z.array(z.string()),
    }),
  ),
  next_actions: z.array(z.string()),
  disclaimer: z.string(),
});

export type CareSummary = z.infer<typeof careSummarySchema>;

const summaryJsonSchema = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    overview: { type: 'STRING' },
    timeline_highlights: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING' },
          title: { type: 'STRING' },
          summary: { type: 'STRING' },
          source_event_ids: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['date', 'title', 'summary', 'source_event_ids'],
      },
    },
    continuity_gaps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          type: { type: 'STRING' },
          severity: { type: 'STRING', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          description: { type: 'STRING' },
          source_event_ids: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['type', 'severity', 'description', 'source_event_ids'],
      },
    },
    next_actions: { type: 'ARRAY', items: { type: 'STRING' } },
    disclaimer: { type: 'STRING' },
  },
  required: [
    'headline',
    'overview',
    'timeline_highlights',
    'continuity_gaps',
    'next_actions',
    'disclaimer',
  ],
};

const assistantSchema = z.object({
  answer: z.string(),
  cited_event_ids: z.array(z.string()),
  suggested_actions: z.array(z.string()).max(4),
});

const assistantJsonSchema = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING' },
    cited_event_ids: { type: 'ARRAY', items: { type: 'STRING' } },
    suggested_actions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['answer', 'cited_event_ids', 'suggested_actions'],
};

function extractText(data: any) {
  const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
  return candidates
    .flatMap((candidate: any) => candidate?.content?.parts ?? [])
    .map((part: any) => part?.text)
    .filter((text: unknown): text is string => typeof text === 'string')
    .join('')
    .trim();
}

function apiUrl(model: string) {
  return `${API_BASE}/${encodeURIComponent(model)}:generateContent`;
}

async function generateContent(input: {
  model: string;
  contents: Array<{ role?: 'user' | 'model'; parts: Array<{ text: string }> }>;
  schema?: Record<string, unknown>;
}) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    throw new GeminiConfigurationError('GEMINI_API_KEY is not configured on the server.');
  }

  const body: Record<string, unknown> = {
    contents: input.contents,
    generationConfig: {
      temperature: 0.15,
      maxOutputTokens: 1800,
      ...(input.schema
        ? {
            responseMimeType: 'application/json',
            responseSchema: input.schema,
          }
        : {}),
    },
  };

  const response = await fetch(apiUrl(input.model), {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const raw = await response.text();

  if (response.ok) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error('The AI service returned invalid JSON.');
    }
  }

  let detail = raw || 'No response body';
  try {
    const parsed = JSON.parse(raw);
    detail = parsed?.error?.message || parsed?.error || detail;
  } catch {
    // Keep the raw response for diagnostics.
  }

  const error = new Error(
    `AI service error ${response.status} (${input.model}): ${String(detail).slice(0, 700)}`,
  ) as Error & { status?: number; model?: string };
  error.status = response.status;
  error.model = input.model;
  throw error;
}

async function createGeminiResponse(
  contents: Array<{ role?: 'user' | 'model'; parts: Array<{ text: string }> }>,
  schema?: Record<string, unknown>,
) {
  let lastRetryableError = 'The AI service is temporarily unavailable.';

  for (const model of modelsToTry()) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt += 1) {
      try {
        const data = await generateContent({ model, contents, schema });
        return { data, model };
      } catch (error) {
        if (error instanceof GeminiConfigurationError) throw error;

        const status = Number((error as { status?: number }).status || 0);
        const message = error instanceof Error ? error.message : String(error);

        if (status === 401 || status === 403) {
          throw error;
        }

        // A model may be unavailable for this project/region. Skip it and move on.
        // An invalid API key, however, must be surfaced instead of silently falling back.
        if (status === 400) {
          if (/api.?key|invalid|authentication|permission/i.test(message)) {
            throw error;
          }
          continue;
        }

        if (status === 404) {
          continue;
        }

        if (!RETRYABLE.has(status)) {
          throw error;
        }

        lastRetryableError = message;
        if (attempt < MAX_ATTEMPTS_PER_MODEL - 1) {
          const delay = 900 * 2 ** attempt + Math.floor(Math.random() * 250);
          await sleep(delay);
        }
      }
    }
  }

  throw new GeminiUnavailableError(
    `${lastRetryableError}. All configured AI models were temporarily unavailable.`,
  );
}

export function getGeminiModel() {
  return primaryModel;
}

export function isGeminiTransientFailure(error: unknown) {
  return error instanceof GeminiUnavailableError;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function buildFallbackCareSummary(input: {
  patientCode: string;
  events: Array<Record<string, any>>;
  gaps: Array<Record<string, any>>;
}): CareSummary {
  const events = [...input.events].sort((a, b) =>
    `${a.event_date} ${a.event_time || ''}`.localeCompare(`${b.event_date} ${b.event_time || ''}`),
  );
  const highlights = events.slice(-8).map((event) => ({
    date: event.event_date || 'Undated',
    title: event.title || String(event.event_type || 'Care event').replaceAll('_', ' '),
    summary: event.summary || 'A documented CareMesh record is available for this event.',
    source_event_ids: event.id ? [event.id] : [],
  }));

  return {
    headline: `Care history for ${input.patientCode}`,
    overview:
      events.length > 0
        ? `Your CareMesh record contains ${events.length} documented care events. The timeline below is organized directly from those records.`
        : 'No care events are currently available in the linked CareMesh record.',
    timeline_highlights: highlights,
    continuity_gaps: input.gaps.map((gap) => ({
      type: gap.gap_type || gap.gapType || 'Continuity item',
      severity: gap.severity || 'LOW',
      description: gap.description || 'A workflow item requires review.',
      source_event_ids: gap.source_event_ids || gap.sourceEventIds || [],
    })),
    next_actions: input.gaps.length
      ? ['Review the listed continuity items with your care team.']
      : ['Continue using CareMesh to keep appointments and supporting documents connected.'],
    disclaimer:
      'CareMesh AI organizes documented records and workflow information. It does not diagnose or make treatment decisions.',
  };
}

export async function generateCareSummary(input: {
  patientCode: string;
  age: number;
  events: Array<Record<string, unknown>>;
  gaps: Array<Record<string, unknown>>;
}): Promise<CareSummary> {
  const payload = {
    patient_reference: input.patientCode,
    age: input.age,
    events: input.events,
    continuity_gaps: input.gaps,
  };

  const response = await createGeminiResponse(
    [
      {
        role: 'user',
        parts: [
          {
            text: `${systemInstruction}\nCreate a source-backed CareMesh longitudinal history summary from this record context. Every claim must be grounded in the supplied events.\n${JSON.stringify(payload)}`,
          },
        ],
      },
    ],
    summaryJsonSchema,
  );

  const raw = extractText(response.data);
  if (!raw) throw new Error('The AI service returned no structured summary.');
  const parsed = safeJsonParse(raw);
  const result = careSummarySchema.safeParse(parsed);
  if (!result.success) throw new Error('The AI service returned an incomplete CareMesh summary.');
  return result.data;
}

export async function askPatientAssistant(input: {
  patient: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  appointments: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  gaps: Array<Record<string, unknown>>;
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
}) {
  const context = {
    patient: {
      patient_code: input.patient.patient_code,
      full_name: input.patient.full_name,
      gender: input.patient.gender,
      dob: input.patient.dob,
    },
    events: input.events,
    appointments: input.appointments,
    documents: input.documents,
    continuity_gaps: input.gaps,
  };

  const conversation = (input.history || [])
    .slice(-8)
    .map((item) => `${item.role.toUpperCase()}: ${item.text}`)
    .join('\n');

  const prompt = `${systemInstruction}

You are answering an authenticated CareMesh patient using only the patient's own record context.

Patient question:
${input.message}

Recent conversation:
${conversation || '(none)'}

Patient record context:
${JSON.stringify(context)}

Rules:
- Answer directly when the record contains the answer.
- If the answer is not available, say so clearly.
- For appointment and document questions, provide exact dates/statuses from the record.
- For clinical advice, refuse only that clinical portion and direct the patient to their clinician.
- cited_event_ids must contain only event IDs supplied in the context.
- suggested_actions must be workflow/navigation actions, not treatment instructions.
`;

  const response = await createGeminiResponse(
    [
      ...(input.history || []).slice(-8).map((item) => ({
        role: item.role === 'assistant' ? ('model' as const) : ('user' as const),
        parts: [{ text: item.text }],
      })),
      { role: 'user', parts: [{ text: prompt }] },
    ],
    assistantJsonSchema,
  );

  const raw = extractText(response.data);
  if (!raw) throw new Error('The AI service returned no assistant response.');
  const parsed = safeJsonParse(raw);
  const result = assistantSchema.safeParse(parsed);
  if (!result.success) throw new Error('The AI service returned an incomplete assistant response.');
  return result.data;
}

export function buildFallbackAssistant(input: {
  message: string;
  events: Array<Record<string, any>>;
  appointments: Array<Record<string, any>>;
  documents: Array<Record<string, any>>;
  gaps: Array<Record<string, any>>;
}) {
  const q = input.message.toLowerCase();
  const citations: string[] = [];
  let answer = 'I can help you navigate your CareMesh record. The AI service is temporarily unavailable, so this answer is based directly on your stored record.';
  const actions: string[] = [];

  if (q.includes('appointment') || q.includes('schedule') || q.includes('visit')) {
    const upcoming = input.appointments
      .filter((a) => a.status !== 'CANCELLED' && a.status !== 'COMPLETED')
      .sort((a, b) => `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`))
      .slice(0, 3);
    if (!upcoming.length) {
      answer = 'There are no upcoming active appointments in your CareMesh record.';
    } else {
      answer = `Your upcoming appointment${upcoming.length > 1 ? 's are' : ' is'}:\n${upcoming
        .map((a) => `• ${a.appointment_date} at ${String(a.appointment_time || '').slice(0, 5)} — ${a.department || 'Care visit'} with ${a.clinician || 'your care team'} (${a.status}).`)
        .join('\n')}`;
    }
    actions.push('Open Appointments');
  } else if (q.includes('document') || q.includes('file') || q.includes('report')) {
    if (!input.documents.length) {
      answer = 'There are no documents currently visible in your CareMesh record.';
    } else {
      const docs = input.documents.slice(0, 8);
      answer = `You currently have ${input.documents.length} document${input.documents.length === 1 ? '' : 's'} in CareMesh:\n${docs
        .map((d) => `• ${d.file_name} — ${d.document_type} (${d.status}).`)
        .join('\n')}`;
    }
    actions.push('Open My Documents');
  } else if (q.includes('gap') || q.includes('unresolved') || q.includes('missing') || q.includes('review')) {
    if (!input.gaps.length) {
      answer = 'There are no unresolved continuity items currently shown in your CareMesh record.';
    } else {
      answer = `CareMesh currently shows ${input.gaps.length} unresolved continuity item${input.gaps.length === 1 ? '' : 's'}:\n${input.gaps
        .map((g) => `• ${g.gap_type || 'Continuity item'} (${g.severity}): ${g.description}`)
        .join('\n')}`;
    }
    actions.push('Open Timeline');
  } else if (q.includes('timeline') || q.includes('recent') || q.includes('activity') || q.includes('history')) {
    const recent = input.events.slice(0, 5);
    if (!recent.length) {
      answer = 'Your CareMesh timeline does not contain any events yet.';
    } else {
      answer = `Your recent documented care activity:\n${recent
        .map((e) => {
          if (e.id) citations.push(String(e.id));
          return `• ${e.event_date || 'Undated'} — ${e.title || String(e.event_type || 'Care event').replaceAll('_', ' ')}. ${e.summary || ''}`.trim();
        })
        .join('\n')}`;
    }
    actions.push('Open My Timeline');
  } else {
    answer = 'I can help you find appointments, documents, timeline events and unresolved continuity items in your CareMesh record. For clinical questions, please contact your qualified clinician.';
    actions.push('Open My Timeline');
    actions.push('Open Appointments');
    actions.push('Open My Documents');
  }

  return {
    answer,
    cited_event_ids: citations,
    suggested_actions: actions.slice(0, 4),
    fallback: true,
  };
}
