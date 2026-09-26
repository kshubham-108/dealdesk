"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_BRIEF_TEXT =
  "Road bike for commuting and weekend rides, 54cm frame, good condition. Collect in East " +
  "London this week, weekday evenings after 6. Hoping to pay about £220, absolute max £260.";

const CONDITIONS = ["like new", "very good", "good", "fair"] as const;

type Fields = {
  item: string;
  keywords: string[];
  size_token: string | null;
  min_condition: (typeof CONDITIONS)[number];
  location: string | null;
  availability: string | null;
  target_price: number;
  max_price: number;
};

export default function Home() {
  const router = useRouter();
  const [rawText, setRawText] = useState(DEFAULT_BRIEF_TEXT);
  const [fields, setFields] = useState<Fields | null>(null);
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState<"autopilot" | "grokbot" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reviewBrief() {
    setError(null);
    setParsing(true);
    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: rawText }),
      });
      if (!res.ok) throw new Error("Couldn't parse that brief.");
      const data = await res.json();
      setFields(data.fields);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setParsing(false);
    }
  }

  async function runHunt(agentMode: "autopilot" | "grokbot") {
    if (!fields) return;
    setError(null);
    setCreating(agentMode);
    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: rawText, fields, agent_mode: agentMode }),
      });
      if (!res.ok) throw new Error("Couldn't start the hunt.");
      const data = await res.json();
      router.push(`/hunt/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setCreating(null);
    }
  }

  function updateField<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          DealDesk
        </h1>
        <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-400">
          An AI agent for each side of a second-hand deal.
        </p>

        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <label htmlFor="brief-text" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            What are you looking for?
          </label>
          <textarea
            id="brief-text"
            className="mt-2 w-full rounded-lg border border-zinc-300 p-3 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            rows={4}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
          <button
            type="button"
            onClick={reviewBrief}
            disabled={parsing || !rawText.trim()}
            className="mt-3 rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {parsing ? "Reading your brief…" : "Review brief"}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {fields && (
          <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Here&apos;s what I got — edit anything before running the hunt.
            </h2>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Item">
                <input
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  value={fields.item}
                  onChange={(e) => updateField("item", e.target.value)}
                />
              </Field>
              <Field label="Keywords (comma separated)">
                <input
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  value={fields.keywords.join(", ")}
                  onChange={(e) =>
                    updateField(
                      "keywords",
                      e.target.value.split(",").map((k) => k.trim()).filter(Boolean)
                    )
                  }
                />
              </Field>
              <Field label="Size (optional)">
                <input
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  value={fields.size_token ?? ""}
                  onChange={(e) => updateField("size_token", e.target.value || null)}
                />
              </Field>
              <Field label="Minimum condition">
                <select
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  value={fields.min_condition}
                  onChange={(e) => updateField("min_condition", e.target.value as Fields["min_condition"])}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Location (optional)">
                <input
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  value={fields.location ?? ""}
                  onChange={(e) => updateField("location", e.target.value || null)}
                />
              </Field>
              <Field label="Availability (optional)">
                <input
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  value={fields.availability ?? ""}
                  onChange={(e) => updateField("availability", e.target.value || null)}
                />
              </Field>
              <Field label="Target price (£)">
                <input
                  type="number"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  value={fields.target_price}
                  onChange={(e) => updateField("target_price", Number(e.target.value))}
                />
              </Field>
              <Field label="Absolute max (£, secret from sellers)">
                <input
                  type="number"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  value={fields.max_price}
                  onChange={(e) => updateField("max_price", Number(e.target.value))}
                />
              </Field>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => runHunt("autopilot")}
                disabled={creating !== null}
                className="flex-1 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {creating === "autopilot" ? "Starting…" : "Run the hunt"}
              </button>
              <button
                type="button"
                onClick={() => runHunt("grokbot")}
                disabled={creating !== null}
                className="flex-1 rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100"
              >
                {creating === "grokbot" ? "Starting…" : "Start with Grok Bot"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
