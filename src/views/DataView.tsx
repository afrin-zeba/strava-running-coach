import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Selector } from "@astryxdesign/core/Selector";
import { addDays, routePoints } from "../activities";
import { DEMO_DATE, durationLabel, paceLabel, shortDate } from "../data";
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
import type { Activity, ConnectionState, RunnerProfile } from "../types";

interface Props {
  activities: Activity[];
  connection: ConnectionState;
  fetching: boolean;
  lastUpdated: string;
  live?: boolean;
  today?: string;
  onDetail?: (id: string) => Promise<void>;
  loadMore?: () => void;
  hasMore?: boolean;
  refresh: () => void;
  onConnect: () => void;
  onAnalysis: () => void;
  profile: RunnerProfile;
}
const issues: Partial<Record<ConnectionState, [string, string]>> = {
  disconnected: [
    "Your miles belong here.",
    "Connect Strava when live integration is available, or explore the demo activities.",
  ],
  empty: [
    "Every running story starts somewhere.",
    "There are no activities in this example history yet. Your coach can start with the context you share.",
  ],
  expired: [
    "Your Strava sign-in has expired.",
    "Reconnect to restore access. This is an authentication issue, not a subscription check.",
  ],
  "subscription-required": [
    "Strava subscription required",
    "Connect an account with an active Strava subscription, then try again.",
  ],
  "rate-limit": [
    "Let’s give the connection a moment.",
    "The activity source has reached its request limit. Try again later; your context is still saved.",
  ],
  error: [
    "The activity source is taking a break.",
    "Something went wrong while loading activities. Try again without changing your saved context.",
  ],
};

export function DataView({
  activities,
  connection,
  fetching,
  lastUpdated,
  refresh,
  onConnect,
  onAnalysis,
  profile,
  live = false,
  today = DEMO_DATE,
  onDetail,
  loadMore,
  hasMore,
}: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [limit, setLimit] = useState(10);
  const [chartMode, setChartMode] = useState<
    "pace" | "elevation" | "heartRate"
  >("pace");
  const [zoom, setZoom] = useState(1);
  const selected = activities.find((a) => a.id === selectedId) ?? activities[0];
  useEffect(() => {
    setZoom(1);
  }, [selected?.id]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  useEffect(() => {
    if (!live || !selected || selected.detailLoaded || !onDetail) {
      setDetailLoading(false);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setDetailError("");
    onDetail(selected.id)
      .catch((error) => {
        if (active)
          setDetailError(
            error instanceof Error
              ? error.message
              : "Could not load run details.",
          );
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected?.id, selected?.detailLoaded, live, lastUpdated]);
  const issue = issues[connection];
  const plot = selected ? routePoints(selected) : "";
  const plotStart = plot.split(" ")[0]?.split(",") ?? [];
  const lastWeek = activities.filter(
    (a) => a.date >= addDays(today, -6) && a.date <= today,
  );
  const distance = lastWeek.reduce((sum, a) => sum + a.distance, 0);
  const daysToRace = profile.race.date
    ? Math.ceil(
        (new Date(`${profile.race.date}T12:00:00Z`).getTime() -
          new Date(`${today}T12:00:00Z`).getTime()) /
          86400000,
      )
    : null;
  const weekBars = Array.from({ length: 7 }, (_, i) => {
    const key = addDays(today, i - 6);
    return {
      day: new Intl.DateTimeFormat("en-IN", {
        weekday: "narrow",
        timeZone: "UTC",
      }).format(new Date(key)),
      distance: lastWeek
        .filter((a) => a.date === key)
        .reduce((sum, a) => sum + a.distance, 0),
    };
  });
  const nextRace =
    profile.goal === "First half marathon" ||
    profile.goal === "Faster half marathon";
  return (
    <VStack gap={6} className="view-enter">
      <section className="hero">
        <VStack gap={3}>
          <p className="eyebrow">
            <i className="orange-line" />
            YOUR RUNNING, AT A GLANCE
          </p>
          <h1>
            Your miles,
            <br />
            <em>in perspective.</em>
          </h1>
          <p className="hero-subtitle">
            A little context for every kilometre.
            <br className="mobile-break" /> A little intention for what comes
            next.
          </p>
        </VStack>
        <section className="race-card">
          <TrackArt />
          <p className="eyebrow">
            {nextRace ? "ON YOUR HORIZON" : "YOUR NEXT CHAPTER"}
          </p>
          <Icon name="flag" size={23} />
          <h2>{nextRace ? "The half marathon." : "Keep showing up."}</h2>
          <p>
            {nextRace
              ? profile.race.location
              : profile.goal === "Custom goal"
                ? profile.customGoal
                : profile.goal}
          </p>
          <HStack gap={2} vAlign="center">
            <Icon name="calendar" size={15} />
            <small>
              {profile.race.date && nextRace
                ? shortDate(profile.race.date) +
                  " " +
                  profile.race.date.slice(0, 4)
                : "December · date to be confirmed"}
            </small>
          </HStack>
          {daysToRace !== null && nextRace && (
            <small>
              {daysToRace < 0
                ? "Past race date · update your context"
                : daysToRace === 0
                  ? live
                    ? "Race day"
                    : "Race day in the demo timeline"
                  : `${daysToRace} days to go · as of ${shortDate(today)} ${today.slice(0, 4)}`}
            </small>
          )}
          <button className="text-link" onClick={onAnalysis}>
            Make it your goal <Icon name="chevron" size={15} />
          </button>
        </section>
      </section>
      <HStack
        className="data-toolbar"
        hAlign="between"
        vAlign="center"
        wrap="wrap"
      >
        <HStack gap={2} vAlign="center">
          <i className="status-dot" />
          <small>
            {fetching
              ? "Loading activities…"
              : live
                ? "Your Strava runs"
                : "Synthetic demo activities"}
            <b className="toolbar-divider">/</b>
            {activities.length} loaded runs
          </small>
        </HStack>
        <Button
          label={
            fetching ? "Refreshing" : live ? "Refresh Strava" : "Refresh demo"
          }
          variant="ghost"
          size="sm"
          icon={<Icon name="refresh" size={16} />}
          isLoading={fetching}
          onClick={refresh}
        />
      </HStack>
      {connection === "stale" && (
        <Note warning>
          Showing older sample activities. Refresh to restore the current demo
          snapshot.
        </Note>
      )}
      {issue ? (
        <Panel className="empty-state">
          <Icon
            name={connection === "subscription-required" ? "shield" : "run"}
            size={38}
          />
          <h2>{issue[0]}</h2>
          <p>{issue[1]}</p>
          <small>Connection-state preview · no account has been checked.</small>
          <HStack gap={3} wrap="wrap">
            <Button
              label="Explore demo activities"
              variant="primary"
              onClick={refresh}
            />
            <Button label="Connection details" onClick={onConnect} />
          </HStack>
        </Panel>
      ) : !selected ? (
        <Panel className="loading-state">
          <Icon name="refresh" size={28} />
          <p role="status">
            {fetching
              ? "Loading your miles…"
              : "No runs in the loaded history."}
          </p>
          {hasMore && (
            <Button
              label="Load more activities"
              onClick={loadMore}
              isLoading={fetching}
            />
          )}
        </Panel>
      ) : (
        <>
          <section className="stats-grid" aria-label="Selected run statistics">
            {[
              {
                label: "Distance",
                value: selected.distance.toFixed(2),
                unit: "km",
                icon: "run" as const,
                caption: `${shortDate(selected.date)} · ${selected.effort.toLowerCase()}`,
              },
              {
                label: "Average pace",
                value: paceLabel(selected.pace),
                unit: "/km",
                icon: "clock" as const,
                caption: "Moving time ÷ distance",
              },
              {
                label: "Moving time",
                value: durationLabel(selected.movingTime),
                unit: "",
                icon: "calendar" as const,
                caption: `${durationLabel(selected.elapsedTime)} elapsed`,
              },
              {
                label: "Elevation gain",
                value: selected.elevation ?? "—",
                unit: "m",
                icon: "mountain" as const,
                caption: live
                  ? "Recorded elevation gain"
                  : "A few gentle ups and downs",
              },
            ].map((stat) => (
              <Panel key={stat.label} className="stat-card">
                <HStack hAlign="between" vAlign="center">
                  <p>{stat.label}</p>
                  <Icon name={stat.icon} size={18} />
                </HStack>
                <h2>
                  {stat.value}
                  <small>{stat.unit}</small>
                </h2>
                <small>{stat.caption}</small>
              </Panel>
            ))}
          </section>
          {detailLoading && (
            <p role="status">Loading recorded route, streams and zones…</p>
          )}
          {detailError && <Note warning>{detailError}</Note>}
          {selected.warnings?.map((w) => (
            <Note key={w}>{w}</Note>
          ))}
          <section className="latest-grid">
            <Panel className="route-panel">
              <header className="panel-heading">
                <VStack gap={1}>
                  <p className="eyebrow">
                    {selected.id === activities[0].id
                      ? "YOUR LATEST RUN"
                      : "SELECTED RUN"}
                  </p>
                  <h2>{selected.title}</h2>
                </VStack>
                <strong className="effort-tag">{selected.effort}</strong>
              </header>
              {selected.route ? (
                <figure className="route-map">
                  <svg
                    role="img"
                    aria-label={`${live ? "Recorded GPS route" : "Illustrative route"} for ${shortDate(selected.date)}, ${selected.distance} kilometres`}
                    viewBox="0 0 400 300"
                    preserveAspectRatio="xMidYMid slice"
                  >
                    {live ? (
                      <rect width="400" height="300" fill="var(--map-base)" />
                    ) : (
                      <>
                        <defs>
                          <pattern
                            id="map-grid"
                            width="38"
                            height="40"
                            patternUnits="userSpaceOnUse"
                            patternTransform="rotate(-12)"
                          >
                            <path
                              d="M38 0H0V40"
                              fill="none"
                              stroke="var(--map-road)"
                              strokeWidth="5"
                            />
                          </pattern>
                        </defs>
                        <rect width="400" height="300" fill="var(--map-base)" />
                        <rect width="400" height="300" fill="url(#map-grid)" />
                        <text x="150" y="151" className="map-label">
                          DEMO ROUTE
                        </text>
                      </>
                    )}
                    <g
                      transform={`translate(200 150) scale(${zoom}) translate(-200 -150)`}
                    >
                      <polyline
                        points={plot}
                        fill="none"
                        stroke="var(--color-background-surface)"
                        strokeWidth="8"
                        strokeLinejoin="round"
                      />
                      <polyline
                        points={plot}
                        fill="none"
                        stroke="var(--color-accent)"
                        strokeWidth="4"
                        strokeLinejoin="round"
                      />
                      <circle
                        cx={Number(plotStart[0])}
                        cy={Number(plotStart[1])}
                        r="7"
                        fill="var(--color-accent)"
                        stroke="var(--color-background-surface)"
                        strokeWidth="3"
                      />
                    </g>
                  </svg>
                  <figcaption>
                    <Icon name="pin" size={14} />
                    {live
                      ? "Recorded GPS trace · not for navigation"
                      : "Illustrative route · not for navigation"}
                  </figcaption>
                  <HStack className="map-controls" gap={1}>
                    <Button
                      label="Zoom out route"
                      isIconOnly
                      onClick={() => setZoom(Math.max(1, zoom - 0.25))}
                      isDisabled={zoom <= 1}
                    >
                      −
                    </Button>
                    <Button
                      label="Zoom in route"
                      isIconOnly
                      onClick={() => setZoom(Math.min(2, zoom + 0.25))}
                      isDisabled={zoom >= 2}
                    >
                      +
                    </Button>
                  </HStack>
                </figure>
              ) : (
                <section className="route-unavailable">
                  <Icon name="pin" size={32} />
                  <p>Route unavailable for this activity.</p>
                  <small>Pace and distance are still available below.</small>
                </section>
              )}
              <HStack
                className="route-footer"
                hAlign="between"
                wrap="wrap"
                gap={2}
              >
                <small>
                  <Icon name="calendar" size={14} />
                  {shortDate(selected.date)} {selected.date.slice(0, 4)} ·{" "}
                  {live ? "Strava activity" : "Sample activity"}
                </small>
                <small>
                  <Icon name="heart" size={14} />
                  {selected.heartRate
                    ? `${selected.heartRate} bpm avg`
                    : "Heart rate unavailable"}
                </small>
              </HStack>
            </Panel>
            <Panel className="week-summary">
              <p className="eyebrow">THE BIGGER PICTURE</p>
              <h2>
                Small efforts.
                <br />
                <em>Steady momentum.</em>
              </h2>
              <p>
                You made time for {lastWeek.length} runs in the last 7 days.
                There’s something to build on.
              </p>
              <HStack className="weekly-total" gap={2} vAlign="end">
                <strong>{distance.toFixed(1)}</strong>
                <p>km this week</p>
              </HStack>
              <section
                className="week-bars"
                aria-label="Recent seven days of running"
              >
                {weekBars.map((day, i) => (
                  <VStack key={i} gap={2} hAlign="center">
                    <i
                      className={day.distance ? "active" : ""}
                      style={{
                        height: `${day.distance ? (day.distance / Math.max(...weekBars.map((d) => d.distance), 1)) * 82 : 15}%`,
                      }}
                      title={`${day.distance.toFixed(2)} km`}
                    />
                    <small>{day.day}</small>
                  </VStack>
                ))}
              </section>
              <p className="weekly-caption">
                {shortDate(addDays(today, -6))}–{shortDate(today)} ·{" "}
                {live ? "loaded Strava history" : "synthetic history"}
              </p>
              <Button
                label="Explore your analysis"
                variant="primary"
                width="100%"
                icon={<Icon name="spark" size={16} />}
                onClick={onAnalysis}
              />
            </Panel>
          </section>
          <Panel className="chart-panel">
            <header className="panel-heading">
              <VStack gap={1}>
                <p className="eyebrow">THE SHAPE OF YOUR RUN</p>
                <h2>Find your rhythm.</h2>
              </VStack>
              <Selector
                label="Run chart"
                isLabelHidden
                value={chartMode}
                onChange={(value) =>
                  value && setChartMode(value as typeof chartMode)
                }
                options={[
                  { value: "pace", label: "Pace" },
                  { value: "elevation", label: "Elevation" },
                  { value: "heartRate", label: "Heart rate" },
                ]}
                width="9rem"
                size="sm"
              />
            </header>
            {!selected.streams.some((s) => s[chartMode] !== undefined) ? (
              <p className="chart-unavailable">
                No recorded data is available for this chart.
              </p>
            ) : (
              <figure className="run-chart">
                <ResponsiveContainer width="100%" height={220} minWidth={0}>
                  <AreaChart
                    data={selected.streams}
                    margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="run-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="var(--color-accent)"
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--color-accent)"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      stroke="var(--line)"
                      strokeDasharray="3 5"
                    />
                    <XAxis
                      dataKey="distance"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={40}
                      tickFormatter={(v) => `${v} km`}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      width={48}
                      domain={["dataMin - 10", "dataMax + 10"]}
                      reversed={chartMode === "pace"}
                      tickFormatter={(v) =>
                        chartMode === "pace"
                          ? paceLabel(v)
                          : String(Math.round(v))
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--surface)",
                        border: "1px solid var(--line)",
                        borderRadius: "0.6rem",
                        color: "var(--ink)",
                      }}
                      labelFormatter={(v) => `${v} km`}
                      formatter={(v) => [
                        chartMode === "pace"
                          ? `${paceLabel(Number(v))} /km`
                          : `${Math.round(Number(v))} ${chartMode === "elevation" ? "m" : "bpm"}`,
                        chartMode === "heartRate"
                          ? "Heart rate"
                          : chartMode === "pace"
                            ? "Pace"
                            : "Elevation",
                      ]}
                    />
                    <Area
                      dataKey={chartMode}
                      type="monotone"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      fill="url(#run-fill)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <figcaption>
                  {chartMode === "pace"
                    ? `Average ${paceLabel(selected.pace)} /km over ${selected.distance} km.`
                    : chartMode === "elevation"
                      ? `${selected.elevation} metres of climbing. Elevation shown in metres above sea level.`
                      : `Average ${selected.heartRate} bpm; maximum ${selected.maxHeartRate ?? "unavailable"} bpm.`}{" "}
                  {live ? "Recorded sensor data." : "Synthetic sensor data."}
                </figcaption>
              </figure>
            )}
          </Panel>
          <section className="detail-grid">
            <Panel className="zones-panel">
              <SectionHeading
                title="Effort, in balance."
                eyebrow="HEART-RATE ZONES"
              />
              {selected.zones ? (
                <>
                  <section
                    className="zone-strip"
                    aria-label="Zone time distribution"
                  >
                    {selected.zones
                      .filter((z) => z.seconds > 0)
                      .map((z) => (
                        <i
                          key={z.name}
                          style={{ flex: z.seconds, background: z.color }}
                          title={`${z.name}: ${durationLabel(z.seconds)}`}
                        />
                      ))}
                  </section>
                  <section className="zone-list">
                    {selected.zones.map((z) => (
                      <HStack key={z.name} hAlign="between" vAlign="center">
                        <HStack gap={2} vAlign="center">
                          <i style={{ background: z.color }} />
                          <strong>{z.name}</strong>
                          <small>{z.label}</small>
                        </HStack>
                        <small>
                          {z.seconds ? durationLabel(z.seconds) : "0 min"} ·{" "}
                          {Math.round((z.seconds / selected.movingTime) * 100)}%
                        </small>
                      </HStack>
                    ))}
                  </section>
                  <p className="fine-print">
                    {live
                      ? "Current personal heart-rate boundaries applied to recorded moving samples. Missing sensor intervals are excluded."
                      : "Demo zone definitions; these are not your personal zones."}
                  </p>
                </>
              ) : (
                <Note>
                  Zones unavailable: recorded heart rate or personal zone
                  boundaries are missing.
                </Note>
              )}
            </Panel>
            <Panel className="splits-panel">
              <SectionHeading
                title="One kilometre at a time."
                eyebrow="RUN SPLITS"
              />
              <table>
                <caption className="sr-only">Selected run splits</caption>
                <thead>
                  <tr>
                    <th scope="col">Kilometre</th>
                    <th scope="col">Distance</th>
                    <th scope="col">Pace /km</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.splits.map((s) => (
                    <tr key={s.km}>
                      <th scope="row">{s.km}</th>
                      <td>{s.distance.toFixed(s.distance < 1 ? 2 : 0)} km</td>
                      <td>{paceLabel(s.pace)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="fine-print">
                Cadence{" "}
                {selected.cadence === undefined
                  ? "unavailable"
                  : `${Math.round(selected.cadence)} spm`}{" "}
                · {durationLabel(selected.elapsedTime)} elapsed.
              </p>
            </Panel>
          </section>
          <section className="recent-section">
            <SectionHeading
              title="The miles behind you."
              eyebrow="RECENT ACTIVITIES"
            >
              <small>
                Showing {Math.min(limit, activities.length)} of{" "}
                {activities.length}
              </small>
            </SectionHeading>
            <Panel className="activity-list">
              <table>
                <caption className="sr-only">
                  Recent runs. Select a run to see its details.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Activity</th>
                    <th scope="col">Distance</th>
                    <th scope="col">Pace /km</th>
                    <th scope="col">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.slice(0, limit).map((a) => (
                    <tr
                      key={a.id}
                      className={selected.id === a.id ? "selected-row" : ""}
                    >
                      <th scope="row">
                        <button
                          className="activity-select"
                          onClick={() => {
                            setSelectedId(a.id);
                            document
                              .querySelector(".stats-grid")
                              ?.scrollIntoView({
                                behavior: matchMedia(
                                  "(prefers-reduced-motion: reduce)",
                                ).matches
                                  ? "instant"
                                  : "smooth",
                                block: "start",
                              });
                          }}
                          aria-pressed={selected.id === a.id}
                        >
                          <strong className="run-icon">
                            <Icon name="run" />
                          </strong>
                          <VStack gap={0}>
                            <strong>{a.title}</strong>
                            <small>
                              {shortDate(a.date)} · {a.effort}
                              {a.heartRate === undefined
                                ? " · No heart rate"
                                : ""}
                              {!a.route ? " · No route" : ""}
                            </small>
                          </VStack>
                        </button>
                      </th>
                      <td>
                        {a.distance.toFixed(2)} <small>km</small>
                      </td>
                      <td>{paceLabel(a.pace)}</td>
                      <td>{durationLabel(a.movingTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {limit < activities.length && (
                <Button
                  className="load-more"
                  label="Load 10 more activities"
                  variant="ghost"
                  onClick={() =>
                    setLimit(Math.min(activities.length, limit + 10))
                  }
                />
              )}
            </Panel>
            {hasMore && limit >= activities.length && (
              <Button
                label="Fetch 10 more activities"
                onClick={loadMore}
                isLoading={fetching}
              />
            )}
            <p className="fine-print">
              Loaded history:{" "}
              {shortDate(activities[activities.length - 1].date)}–
              {shortDate(today)} {today.slice(0, 4)} · Last refreshed{" "}
              {lastUpdated || "just now"} ·{" "}
              {live ? "Strava data" : "Synthetic data only"}.
            </p>
          </section>
        </>
      )}
    </VStack>
  );
}
