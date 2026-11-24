import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Selector } from "@astryxdesign/core/Selector";
import { coachingGenerator, fingerprint } from "../services";
import { coachingFingerprint, generateCoaching } from "../coaching";
import { liveTrend } from "../metrics";
import { monthsAgo } from "../activities";
import { durationLabel, getTrend, paceLabel, shortDate } from "../data";
import {
  Button,
  HStack,
  Icon,
  Note,
  Panel,
  SectionHeading,
  TrackArt,
  VStack,
} from "../ui";
import { ProfileEditor } from "./ProfileEditor";
import type {
  Activity,
  AnalysisResult,
  HistoryCoverage,
  RunnerProfile,
} from "../types";
interface Props {
  profile: RunnerProfile;
  onProfileChange: (profile: RunnerProfile) => void;
  saveState: string;
  model: string;
  modelName: string;
  apiKey: string;
  activities: Activity[];
  live: boolean;
  today: string;
  months: number;
  setMonths: (months: number) => void;
  coverage: HistoryCoverage | null;
  loadHistory: (months: number, details?: boolean) => Promise<void>;
  historyLoading: boolean;
  result: AnalysisResult | null;
  onResult: (result: AnalysisResult) => void;
}
export function AnalysisView({
  profile,
  onProfileChange,
  saveState,
  model,
  modelName,
  apiKey,
  activities,
  live,
  today,
  months,
  setMonths,
  coverage,
  loadHistory,
  historyLoading,
  result,
  onResult,
}: Props) {
  const [metric, setMetric] = useState<
    "distance" | "easyPace" | "runs" | "longest"
  >("distance");
  const [generating, setGenerating] = useState(false),
    [error, setError] = useState("");
  const requestGuard = useRef(0);
  const requestedHistory = useRef('');
  const trend = useMemo(
    () =>
      live
        ? liveTrend(activities, months, today)
        : getTrend(activities, months),
    [activities, months, today, live],
  );
  const effectiveCoverage = live
    ? coverage
    : { after: monthsAgo(today, 6), through: today, complete: true };
  const historyReady =
    !live ||
    !!(coverage?.complete && coverage.after <= monthsAgo(today, months));
  const currentFingerprint =
    result?.source === "demo"
      ? fingerprint(profile, model || "demo")
      : coachingFingerprint(
          profile,
          activities,
          model,
          months,
          effectiveCoverage,
          today,
        );
  const stale =
    !!result &&
    (result.fingerprint !== currentFingerprint ||
      (!!result.validUntil && result.validUntil <= Date.now()));
  const needsReview = !!(
    profile.injuries.trim() ||
    profile.restrictions.trim() ||
    profile.recovery === "Need more recovery"
  );
  const racePast = !!profile.race.date && profile.race.date < today;
  useEffect(() => {
    const key = `${today}-${months}`;
    if (live && !historyReady && !historyLoading && requestedHistory.current !== key) {
      requestedHistory.current = key;
      void loadHistory(months);
    }
  }, [live, months, today, historyReady, historyLoading]);
  // Ignore an in-flight response after switching athletes or leaving this analysis view.
  useEffect(() => {
    return () => {
      requestGuard.current++;
    };
  }, []);
  async function generate() {
    const request = ++requestGuard.current;
    setGenerating(true);
    setError("");
    try {
      const value =
        !live && !apiKey
          ? await coachingGenerator.generate(profile, model || "demo")
          : await generateCoaching({
              profile,
              activities,
              model,
              apiKey,
              months,
              coverage: effectiveCoverage,
              today,
            });
      if (request === requestGuard.current) onResult(value);
    } catch (e) {
      if (request === requestGuard.current)
        setError(
          e instanceof Error ? e.message : "Could not generate coaching.",
        );
    } finally {
      if (request === requestGuard.current) setGenerating(false);
    }
  }
  const axisFormatter = (value: number) =>
    metric === "easyPace" ? paceLabel(value) : String(value);
  const facts = result?.facts ?? [];
  const factLabel = (id: string) => {
    const f = facts.find((f) => f.id === id);
    return f ? `${f.label}: ${f.value} ${f.unit}` : "";
  };
  return (
    <VStack gap={6} className="view-enter">
      <header className="analysis-hero">
        <VStack gap={3}>
          <p className="eyebrow">
            <i className="orange-line" />A LITTLE DIRECTION FOR YOUR NEXT MILE
          </p>
          <h1>
            Progress, with
            <br />
            <em>room to breathe.</em>
          </h1>
          <p className="hero-subtitle">
            Understand what’s working. Make your next week a thoughtful one.
          </p>
        </VStack>
        <TrackArt />
      </header>
      <ProfileEditor
        profile={profile}
        onChange={onProfileChange}
        saveState={saveState}
      />
      <Panel className="improvement-panel">
        <SectionHeading
          title="Look how far you’ve come."
          eyebrow="IMPROVEMENT TRACKER"
        >
          <Selector
            label="Improvement timeline"
            isLabelHidden
            value={String(months)}
            onChange={(v) => v && setMonths(Number(v))}
            options={[1, 2, 3, 4, 5, 6].map((m) => ({
              value: String(m),
              label: `Last ${m} ${m === 1 ? "month" : "months"}`,
            }))}
            width="10rem"
            size="sm"
          />
        </SectionHeading>
        {live && (
          <HStack gap={3} wrap="wrap">
            <Button
              label="Refresh history"
              onClick={() => loadHistory(months)}
              isLoading={historyLoading}
            />
            <Button
              label="Load Zone 2 stream history"
              onClick={() => loadHistory(months, true)}
              isLoading={historyLoading}
            />
            <small>
              {coverage
                ? `${coverage.after}–${coverage.through} · ${coverage.complete ? "complete requested history" : "partial history"}`
                : "History not loaded yet"}
            </small>
          </HStack>
        )}
        <section className="improvement-stats">
          <VStack gap={1}>
            <p>{live ? "Zone 2 pace" : "Demo easy-effort pace"}</p>
            <h3>
              {trend.improvement === null
                ? "More data needed"
                : `${Math.abs(trend.improvement)} sec /km`}
              <small>
                {trend.improvement === null
                  ? ""
                  : trend.improvement > 0
                    ? " faster"
                    : trend.improvement < 0
                      ? " slower"
                      : " change"}
              </small>
            </h3>
            <small>{trend.easySamples} qualifying runs</small>
          </VStack>
          <VStack gap={1}>
            <p>Time on your feet</p>
            <h3>
              {durationLabel(
                trend.selected.reduce((sum, a) => sum + a.movingTime, 0),
              )}
            </h3>
            <small>Across {trend.selected.length} runs</small>
          </VStack>
          <VStack gap={1}>
            <p>Your longest run</p>
            <h3>
              {trend.selected.length
                ? Math.max(...trend.selected.map((a) => a.distance)).toFixed(2)
                : "—"}
              <small> km</small>
            </h3>
            <small>In your selected timeline</small>
          </VStack>
        </section>
        <HStack
          className="metric-tabs"
          gap={1}
          wrap="wrap"
          aria-label="Improvement metric"
        >
          {(
            [
              ["distance", "Weekly distance"],
              ["easyPace", live ? "Zone 2 pace" : "Easy pace"],
              ["runs", "Consistency"],
              ["longest", "Longest run"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              label={label}
              size="sm"
              variant={metric === value ? "secondary" : "ghost"}
              aria-pressed={metric === value}
              onClick={() => setMetric(value)}
            />
          ))}
        </HStack>
        {trend.chart.length ? (
          <figure className="trend-chart">
            <ResponsiveContainer width="100%" height={230} minWidth={0}>
              {metric === "easyPace" ? (
                <LineChart
                  data={trend.chart}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--line)"
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                  />
                  <YAxis
                    reversed
                    tickFormatter={axisFormatter}
                    domain={["dataMin - 10", "dataMax + 10"]}
                    width={46}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--line)",
                      color: "var(--ink)",
                    }}
                    formatter={(v) => [
                      `${paceLabel(Number(v))} /km`,
                      "Easy pace",
                    ]}
                  />
                  <Line
                    dataKey="easyPace"
                    stroke="var(--color-accent)"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              ) : (
                <BarChart
                  data={trend.chart}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--line)"
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={40}
                  />
                  <YAxis
                    width={36}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={metric !== "runs"}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--line)",
                      color: "var(--ink)",
                    }}
                    formatter={(v) => [
                      `${v}${metric === "runs" ? " runs" : " km"}`,
                      metric === "distance"
                        ? "Weekly distance"
                        : metric === "runs"
                          ? "Consistency"
                          : "Longest run",
                    ]}
                  />
                  <Bar
                    dataKey={metric}
                    fill="var(--color-accent)"
                    opacity={0.78}
                    radius={[5, 5, 0, 0]}
                    maxBarSize={32}
                    isAnimationActive={false}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
            <figcaption>
              {trend.selected.length} runs from{" "}
              {shortDate(trend.selected[0].date)} to{" "}
              {shortDate(trend.selected[trend.selected.length - 1].date)}.
              Partial calendar weeks are included.{" "}
              {live
                ? "Values calculated from recorded activities."
                : "All values are synthetic."}
            </figcaption>
          </figure>
        ) : (
          <Note>More activity history is needed to compare this timeline.</Note>
        )}
        <p className="insight-line">
          <Icon name="spark" size={19} />
          {trend.improvement === null
            ? "More comparable heart-rate history is needed before making a pace-improvement claim."
            : trend.improvement > 0
              ? `Your ${live ? "recorded Zone 2" : "sample easy-effort"} pace improved by ${trend.improvement} seconds per kilometre.`
              : "Pace varies. Comfortable consistency and recovery matter more than forcing a faster number."}
        </p>
        <small className="fine-print">
          {live
            ? "Zone 2 uses current personal boundaries and recorded time/distance/heart-rate streams. At least two qualifying runs are needed in each half of the timeline. Terrain, weather and fatigue are not controlled."
            : "Synthetic easy-run comparison; not a personal Zone 2 assessment."}
        </small>
      </Panel>
      <section className="coaching-intro">
        <SectionHeading
          title="Your next week, with intention."
          eyebrow="RUNNING COACH"
        >
          <Button
            label={
              live || apiKey
                ? result
                  ? "Generate coaching again"
                  : "Generate coaching"
                : "Generate demo preview"
            }
            variant="primary"
            icon={<Icon name="spark" size={17} />}
            isLoading={generating}
            isDisabled={historyLoading || !historyReady}
            onClick={generate}
          />
        </SectionHeading>
        <p>
          A plan should meet you where you are, not rush you to a finish line.
        </p>
        <Note>
          {live || apiKey
            ? "Generating sends your activity summaries, saved training and diet context to OpenRouter and the selected provider. GPS, account identifiers and credentials are excluded. One request generates all sections; retries are manual."
            : "Demo activities and an illustrative schedule. Add an OpenRouter key and choose a model for AI generation from this synthetic context."}
        </Note>
        {!historyReady && (
          <Note warning>
            Load the selected history before generating coaching. Partial
            history remains labeled and does not establish your training
            baseline.
          </Note>
        )}
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        {stale && (
          <Note warning>
            Your context, activities, timeline, planning date or model changed.
            Generate again before using this result.
          </Note>
        )}
        {racePast && (
          <Note warning>
            Your race date is in the past. Update your goal before preparing for
            a future race.
          </Note>
        )}
      </section>
      {result ? (
        <>
          <HStack className="week-label" hAlign="between" wrap="wrap" gap={2}>
            <h3>
              {shortDate(result.days[0].date)}–{shortDate(result.days[6].date)}{" "}
              {result.days[6].date.slice(0, 4)}
            </h3>
            <small>
              {result.source === "demo"
                ? "Illustrative preview"
                : modelName || result.model}{" "}
              · {new Date(result.generatedAt).toLocaleString("en-IN")}
            </small>
          </HStack>
          {result.coverage && <small>{result.coverage}</small>}
          <section
            className={`training-week ${stale ? "stale-result" : ""}`}
            aria-label="Seven-day training plan"
          >
            {result.days.map((day) => (
              <article
                key={day.date}
                className={`training-day ${day.kind === "Cross-training" ? "recovery" : day.kind.toLowerCase()}`}
              >
                <HStack hAlign="between" vAlign="center">
                  <strong>{day.day}</strong>
                  <small>{shortDate(day.date)}</small>
                </HStack>
                <Icon
                  name={
                    day.kind === "Run"
                      ? "run"
                      : day.kind === "Strength"
                        ? "strength"
                        : "leaf"
                  }
                  size={26}
                />
                <p className="day-kind">{day.kind}</p>
                <h3>{day.title}</h3>
                <strong className="day-duration">
                  {day.duration
                    ? `${day.duration} min${day.distance ? ` · ${day.distance} km` : ""}`
                    : "Take it easy"}
                </strong>
                <p className="day-target">{day.target}</p>
                <details>
                  <summary>Session details</summary>
                  <p>{day.purpose}</p>
                  <p>{day.preparation}</p>
                  {day.exercises && (
                    <ul>
                      {day.exercises.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  <p>
                    <strong>Equipment:</strong>{" "}
                    {day.equipment.length ? day.equipment.join(", ") : "None"}
                  </p>
                </details>
              </article>
            ))}
          </section>
          {needsReview && (
            <Note warning>
              Your context flags an injury, restriction or recovery need.
              Exercise suggestions require review with a qualified professional.
            </Note>
          )}
          {result.improvement && (
            <Panel>
              <SectionHeading
                title="What the data suggests."
                eyebrow="COACH’S OBSERVATIONS"
              />
              <ul>
                {result.improvement.map((item, i) => (
                  <li key={i}>
                    <strong>{factLabel(item.factId)}</strong>
                    <p>{item.explanation}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      ) : (
        <Panel className="coach-placeholder">
          <TrackArt />
          <Icon name="run" size={35} />
          <h3>A week that makes room for you.</h3>
          <p>
            Save your context, load your history and choose a model. Your
            seven-day plan and coaching will appear here.
          </p>
        </Panel>
      )}
      <section className="coach-bottom-grid">
        <Panel className="diet-panel">
          <SectionHeading
            title="Fuel the work. Enjoy the food."
            eyebrow="DIET COACH"
          />
          <strong className="diet-tag">{profile.dietPreference}</strong>
          {result?.diet ? (
            <ol className="diet-list">
              {result.diet.map((item, i) => (
                <li key={i}>
                  <strong>{item.title}</strong>
                  <p>{item.suggestion}</p>
                  <small>{item.timing}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p>
              Personalized meal modifications and training/race fueling
              suggestions appear after AI generation.
            </p>
          )}
          <details className="diet-details">
            <summary>Your current eating context</summary>
            <p>{profile.diet || "No diet entered."}</p>
          </details>
          <small className="fine-print">
            General fueling education. This does not establish medical or
            calorie needs; verify ingredients against your allergies.
          </small>
        </Panel>
        <VStack gap={5}>
          <Panel className="projection-panel">
            <SectionHeading
              title="A direction, not a promise."
              eyebrow="FUTURE PROJECTIONS"
            />
            {result?.projections ? (
              result.projections.map((item, i) => (
                <section className="projection-condition" key={i}>
                  <strong>If {item.condition}</strong>
                  <p>{item.possibility}</p>
                  <small>{item.uncertainty}</small>
                </section>
              ))
            ) : (
              <p>
                Conditional scenarios appear after generation. Numerical race
                predictions and guaranteed outcomes are withheld.
              </p>
            )}
          </Panel>
          <article className="motivation-card">
            <Icon name="run" size={25} />
            <blockquote>
              {result?.motivation?.text ?? "Make room for the next good run."}
            </blockquote>
            {result?.motivation?.factId && (
              <small>{factLabel(result.motivation.factId)}</small>
            )}
            <small>Encouragement, without the hype.</small>
          </article>
        </VStack>
      </section>
    </VStack>
  );
}
