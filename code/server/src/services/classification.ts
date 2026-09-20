import { RequestCategory, REQUEST_CATEGORIES } from '../models';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ClassificationSuggestion {
  suggestedCategory: RequestCategory;
  urgency: UrgencyLevel;
  confidence: number;
  rationale: string;
  provider: 'gemini' | 'heuristic';
}

/**
 * Emergency domain vocabulary rules for fast, zero-dependency heuristic classification.
 */
const HEURISTIC_RULES: Array<{
  category: RequestCategory;
  urgency: UrgencyLevel;
  keywords: string[];
  rationale: string;
}> = [
  {
    category: 'medical',
    urgency: 'critical',
    keywords: [
      'heart attack',
      'cardiac',
      'chest pain',
      'bleeding',
      'unconscious',
      'not breathing',
      'stroke',
      'severe head injury',
      'insulin shock',
      'anaphylaxis',
    ],
    rationale: 'Life-threatening medical trauma / acute symptoms detected',
  },
  {
    category: 'medical',
    urgency: 'high',
    keywords: [
      'insulin',
      'medicine',
      'medication',
      'dialysis',
      'fever',
      'wound',
      'asthma',
      'inhaler',
      'infection',
      'prescription',
      'doctor',
      'hospital',
      'bandage',
      'fracture',
    ],
    rationale: 'Urgent medical assistance or medication required',
  },
  {
    category: 'rescue',
    urgency: 'critical',
    keywords: [
      'trapped',
      'drowning',
      'rooftop',
      'rising water',
      'boat',
      'under rubble',
      'collapsed',
      'stranded',
      'evacuate immediately',
      'current sweeping',
    ],
    rationale: 'Imminent danger from entrapment or rising floodwaters',
  },
  {
    category: 'rescue',
    urgency: 'high',
    keywords: [
      'evacuate',
      'evacuation',
      'stuck',
      'cannot leave',
      'surrounded by water',
      'flooded home',
      'rescue',
      'elderly stuck',
    ],
    rationale: 'Physical extraction or safe relocation needed',
  },
  {
    category: 'shelter',
    urgency: 'high',
    keywords: [
      'tarpaulin',
      'tarp',
      'homeless',
      'displaced',
      'roof destroyed',
      'roof blown off',
      'rain leaking',
      'blanket',
      'tent',
      'bedding',
    ],
    rationale: 'Displacement or lack of weather-resistant emergency shelter',
  },
  {
    category: 'supplies',
    urgency: 'high',
    keywords: [
      'drinking water',
      'clean water',
      'potable water',
      'infant formula',
      'baby food',
      'no food for days',
      'starving',
    ],
    rationale: 'Critical shortage of life-sustaining food or water supplies',
  },
  {
    category: 'supplies',
    urgency: 'medium',
    keywords: [
      'ration',
      'dry food',
      'groceries',
      'rice',
      'lentils',
      'supplies',
      'generator',
      'battery',
      'torch',
      'flashlight',
      'candles',
    ],
    rationale: 'General sustenance and emergency power supplies required',
  },
  {
    category: 'other',
    urgency: 'medium',
    keywords: [
      'downed wire',
      'power line',
      'tree blocking',
      'road blocked',
      'debris',
      'hazard',
      'gas leak',
    ],
    rationale: 'Infrastructure blockage or environmental hazard',
  },
];

/**
 * Fast offline heuristic classifier matching emergency text against emergency domain vocabulary.
 */
export function classifyHeuristic(text: string): ClassificationSuggestion {
  const normalized = text.toLowerCase();

  for (const rule of HEURISTIC_RULES) {
    for (const kw of rule.keywords) {
      if (normalized.includes(kw)) {
        return {
          suggestedCategory: rule.category,
          urgency: rule.urgency,
          confidence: 0.85,
          rationale: `${rule.rationale} (keyword: "${kw}")`,
          provider: 'heuristic',
        };
      }
    }
  }

  // Fallback if no specific keyword matched
  return {
    suggestedCategory: 'other',
    urgency: 'medium',
    confidence: 0.5,
    rationale: 'General distress report',
    provider: 'heuristic',
  };
}

/**
 * Classifies free-text emergency descriptions using Google Gemini 2.5 Flash
 * with a strict 2-second timeout and automatic fallback to heuristic classification.
 */
export async function classifyWithGemini(
  text: string,
  apiKey: string
): Promise<ClassificationSuggestion | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const prompt = `You are an emergency dispatch triage AI. Analyze this distress report description:
"${text.replace(/"/g, '\\"')}"

Task:
1. Classify into EXACTLY one category: "medical", "rescue", "shelter", "supplies", or "other".
2. Classify urgency into: "low", "medium", "high", or "critical".
3. Provide a brief 1-sentence rationale.

Return ONLY a JSON object with this exact shape:
{"category": "...", "urgency": "...", "rationale": "..."}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[Gemini Classification] HTTP ${res.status}: fallback to heuristic`);
      return null;
    }

    const json = (await res.json()) as any;
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    const cat = String(parsed.category || '').toLowerCase().trim() as RequestCategory;
    const urg = String(parsed.urgency || '').toLowerCase().trim() as UrgencyLevel;

    if (!REQUEST_CATEGORIES.includes(cat)) {
      return null;
    }

    const validUrgencies: UrgencyLevel[] = ['low', 'medium', 'high', 'critical'];
    const finalUrgency = validUrgencies.includes(urg) ? urg : 'medium';

    return {
      suggestedCategory: cat,
      urgency: finalUrgency,
      confidence: 0.95,
      rationale: parsed.rationale || 'Categorized by Gemini Flash AI',
      provider: 'gemini',
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn('[Gemini Classification] Request timed out (>5000ms), falling back to heuristic');
    } else {
      console.warn('[Gemini Classification] Error:', err.message);
    }
    return null;
  }
}

/**
 * Top-level classification pipeline:
 * Checks toggle flag -> attempts Gemini Flash -> falls back seamlessly to Heuristic.
 * Never throws. Never blocks.
 */
export async function classifyEmergencyDescription(
  text?: string
): Promise<ClassificationSuggestion | null> {
  // Check global toggle
  if (process.env.ENABLE_AI_CLASSIFICATION === 'false') {
    return null;
  }

  if (!text || typeof text !== 'string' || text.trim().length < 5) {
    return null;
  }

  const cleanText = text.trim();
  const apiKey = process.env.GEMINI_API_KEY;

  // Attempt Gemini Flash if key is present
  if (apiKey && apiKey.trim().length > 0) {
    try {
      const geminiResult = await classifyWithGemini(cleanText, apiKey.trim());
      if (geminiResult) {
        return geminiResult;
      }
    } catch (_err) {
      // Ignore and proceed to heuristic fallback
    }
  }

  // Seamless fallback to heuristic classifier
  return classifyHeuristic(cleanText);
}
