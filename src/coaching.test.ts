import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITIES, DEFAULT_PROFILE } from "./data";
import {
  clearCoachingCache,
  coachingContext,
  coachingFingerprint,
  generateCoaching,
  loadModels,
  validateCoaching,
} from "./coaching";
const today = "2026-11-24",
  coverage = { after: "2026-05-24", through: today, complete: true };
const profile = () => structuredClone(DEFAULT_PROFILE);
const context = () =>
  coachingContext(profile(), ACTIVITIES, 3, coverage, today);
function output() {
  const c = context();
  return {
    days: c.dates.map((d) => ({
      ...d,
      kind: "Rest",
      workout: null,
      title: "A proper rest day",
      duration: 0,
      distance: null as number | null,
      target: "Rest comfortably",
      purpose: "Allow recovery",
      preparation: "No scheduled exercise",
      equipment: [] as string[],
      exercises: [] as string[],
    })),
    improvement: [
      {
        factId: "distance",
        explanation:
          "Your recorded distance gives context for a sustainable routine.",
      },
    ],
    diet: [
      {
        title: "Familiar recovery meal",
        suggestion: "Rice and dal with fruit can fit your usual meals.",
        timing: "After training",
      },
    ],
    projections: [
      {
        condition: "comfortable sessions stay consistent",
        possibility: "Your routine may become more sustainable.",
        uncertainty: "Recovery, weather and interruptions can affect progress.",
      },
    ],
    motivation: {
      text: "Make room for your next good run.",
      factId: null as string | null,
    },
  };
}
const response = (value: unknown) =>
  Response.json({
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(value) } },
    ],
  });
beforeEach(() => clearCoachingCache());
describe("OpenRouter coaching boundary", () => {
  it("sends an allowlisted context without identifiers, routes or secrets", async () => {
    const activities = ACTIVITIES.map((a) => ({
      ...a,
      title: "PRIVATE_ACTIVITY_TITLE",
      id: "PRIVATE_ACTIVITY_ID",
    }));
    const c = JSON.stringify(
      coachingContext(profile(), activities, 3, coverage, today),
    );
    expect(c).not.toContain("PRIVATE_ACTIVITY");
    expect(c).not.toContain("route");
    expect(c).not.toContain("Kanteerava");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(output()));
    const args = {
      profile: profile(),
      activities,
      model: "test/model",
      apiKey: "private-key",
      months: 3,
      coverage,
      today,
      fetcher,
    };
    const result = await generateCoaching(args);
    expect(result.source).toBe("openrouter");
    expect(result.days).toHaveLength(7);
    expect(result.diet).toHaveLength(1);
    expect(result.projections).toHaveLength(1);
    const payload = String(fetcher.mock.calls[0][1]?.body);
    expect(payload).not.toContain("private-key");
    expect(payload).not.toContain("PRIVATE_ACTIVITY");
    expect(
      new Headers(fetcher.mock.calls[0][1]?.headers).get("authorization"),
    ).toBe("Bearer private-key");
    expect(JSON.parse(payload).response_format.json_schema.strict).toBe(true);
    await generateCoaching(args);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([401, 402, 429, 500])(
    "handles provider failure %s without automatic retries",
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));
      await expect(
        generateCoaching({
          profile: profile(),
          activities: ACTIVITIES,
          model: "m",
          apiKey: "key",
          months: 3,
          coverage,
          today,
          fetcher,
        }),
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("rejects invalid JSON, truncation and missing required output", async () => {
    for (const body of [
      { choices: [{ message: { content: "not JSON" } }] },
      { choices: [{ finish_reason: "length", message: { content: "{}" } }] },
      { choices: [{ message: { content: "{}" } }] },
    ]) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(body));
      await expect(
        generateCoaching({
          profile: profile(),
          activities: ACTIVITIES,
          model: "m",
          apiKey: "key",
          months: 3,
          coverage,
          today,
          fetcher,
        }),
      ).rejects.toThrow();
    }
  });
  it("requires an explicit model and key and rejects expired activity inputs", async () => {
    const args = {
      profile: profile(),
      activities: ACTIVITIES,
      model: "",
      apiKey: "",
      months: 3,
      coverage,
      today,
    };
    await expect(generateCoaching(args)).rejects.toThrow("explicitly choose");
    await expect(
      generateCoaching({
        ...args,
        model: "m",
        apiKey: "key",
        activities: [{ ...ACTIVITIES[0], expiresAt: 1 }],
      }),
    ).rejects.toThrow("expired");
  });
  it("filters model capabilities, displays pricing and caches the catalog", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          { id: "unsupported", name: "No JSON", supported_parameters: [] },
          { id: "test:batch", name: "Batch only", supported_parameters: ['structured_outputs'], architecture: {output_modalities:['text']}, pricing: {prompt:'0',completion:'0'} },
          { id: "image", name: "Image model", supported_parameters: ['structured_outputs'], architecture: {output_modalities:['text','image']}, pricing: {prompt:'0',completion:'0'} },
          { id: "router", name: "Variable pricing", supported_parameters: ['structured_outputs'], architecture: {output_modalities:['text']}, pricing: {prompt:'-1',completion:'-1'} },
          {
            id: "good",
            name: "JSON model",
            supported_parameters: ["structured_outputs"],
            context_length: 32000,
            architecture: { output_modalities: ['text'] },
            pricing: { prompt: "0.000001", completion: "0.000002" },
          },
        ],
      }),
    );
    expect(await loadModels(fetcher)).toEqual([
      {
        id: "good",
        name: "JSON model",
        detail: "$1.00 input / $2.00 output per 1M tokens",
        contextLength: 32000,
      },
    ]);
    await loadModels(fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
describe("training and factual guardrails", () => {
  it("rejects overlong, unavailable-equipment and misdated sessions", () => {
    for (const change of [
      { duration: 999 },
      { equipment: ["Unavailable barbell"] },
      { date: "2030-01-01" },
    ]) {
      const v = output();
      Object.assign(v.days[0], change);
      expect(() => validateCoaching(v, context())).toThrow();
    }
  });
  it("caps weekly duration, distance and long runs at the completed baseline", () => {
    const v = output();
    Object.assign(v.days[0], {
      kind: "Run",
      workout: "Running",
      duration: 40,
      distance: 100,
      target: "Easy effort",
    });
    expect(() => validateCoaching(v, context())).toThrow("longest");
    v.days[0].distance = 5;
    Object.assign(v.days[2], {
      kind: "Run",
      workout: "Running",
      duration: 40,
      distance: 5,
    });
    Object.assign(v.days[4], {
      kind: "Run",
      workout: "Running",
      duration: 75,
      distance: 5,
    });
    expect(() => validateCoaching(v, context())).toThrow("volume");
  });
  it("holds exercise when recovery or injuries require review", () => {
    const p = profile();
    p.injuries = "Knee pain";
    const c = coachingContext(p, ACTIVITIES, 3, coverage, today),
      v = output();
    Object.assign(v.days[0], {
      kind: "Run",
      workout: "Running",
      duration: 10,
      distance: 1,
    });
    expect(() => validateCoaching(v, c)).toThrow("review");
  });
  it("allows conservative effort-based run/walk only when history is insufficient", () => {
    const c = coachingContext(profile(), [], 3, null, today),
      v = output();
    Object.assign(v.days[0], {
      kind: "Run",
      workout: "Running",
      duration: 15,
      distance: null as number | null,
      target: "Easy conversational run / walk",
    });
    expect(() => validateCoaching(v, c)).not.toThrow();
    v.days[0].target = "6:00 /km";
    expect(() => validateCoaching(v, c)).toThrow("Insufficient history");
  });
  it("rejects unsupported measurements, guarantees, attributions and fact references", () => {
    for (const change of [
      { motivation: { text: "Only 1 in 10000 runners do this", factId: null } },
      {
        improvement: [
          { factId: "fabricated", explanation: "Better than ever" },
        ],
      },
      {
        projections: [
          {
            condition: "you train",
            possibility: "You will definitely finish faster",
            uncertainty: "Maybe",
          },
        ],
      },
    ])
      expect(() =>
        validateCoaching({ ...output(), ...change }, context()),
      ).toThrow();
  });
  it("rejects listed allergens, related ingredients and incompatible diets", () => {
    for (const allergy of ["nuts", "almonds"]) {
      const p = profile();
      p.allergies = allergy;
      const v = output();
      v.diet[0].suggestion = "Try almond butter on toast";
      expect(() =>
        validateCoaching(v, coachingContext(p, ACTIVITIES, 3, coverage, today)),
      ).toThrow();
    }
    const p = profile();
    p.dietPreference = "Vegan";
    const v = output();
    v.diet[0].suggestion = "Have milk and eggs";
    expect(() =>
      validateCoaching(v, coachingContext(p, ACTIVITIES, 3, coverage, today)),
    ).toThrow();
  });
  it("invalidates the fingerprint on model, date, profile, timeline and source changes", () => {
    const p = profile(),
      base = coachingFingerprint(p, ACTIVITIES, "m", 3, coverage, today);
    expect(
      coachingFingerprint(p, ACTIVITIES, "other", 3, coverage, today),
    ).not.toBe(base);
    expect(
      coachingFingerprint(p, ACTIVITIES, "m", 2, coverage, today),
    ).not.toBe(base);
    expect(
      coachingFingerprint(p, ACTIVITIES, "m", 3, coverage, "2026-11-25"),
    ).not.toBe(base);
    expect(
      coachingFingerprint(
        { ...p, diet: "Changed" },
        ACTIVITIES,
        "m",
        3,
        coverage,
        today,
      ),
    ).not.toBe(base);
    expect(
      coachingFingerprint(
        p,
        ACTIVITIES.map((a) => ({ ...a, id: "different" })),
        "m",
        3,
        coverage,
        today,
      ),
    ).not.toBe(base);
  });
});
