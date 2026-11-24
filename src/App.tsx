import { useEffect, useRef, useState } from "react";
import { Theme } from "@astryxdesign/core/theme";
import { Drawer } from "@astryxdesign/core/Drawer";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import {
  ACCOUNTS,
  activitySource,
  profileStorage,
  readSetting,
  saveSetting,
  validateProfile,
} from "./services";
import { DEFAULT_PROFILE, DEMO_DATE } from "./data";
import { localDate, monthsAgo, mondayOf, addDays, isRun } from "./activities";
import { clearCoachingCache, loadModels, purgeCoachingCache } from "./coaching";
import { stravaRequest, stravaData, StravaApiError } from "./strava";
import { milemarkTheme } from "./theme-built/milemark.js";
import {
  Brand,
  Button,
  HStack,
  Icon,
  Modal,
  Note,
  VStack,
} from "./ui";
import { DataView } from "./views/DataView";
import { AnalysisView } from "./views/AnalysisView";
import type {
  Activity,
  AnalysisResult,
  ConnectionState,
  RunnerProfile,
  StravaStatus,
  ThemeMode,
  ActivityPage,
  HistoryCoverage,
  ModelOption,
} from "./types";

export default function App() {
  const [account, setAccount] = useState(() =>
    readSetting(
      "account",
      ACCOUNTS.map((a) => a.id),
      "runner-one",
    ),
  );
  const [signedIn, setSignedIn] = useState(
    () => readSetting("session", ["in", "out"], "in") === "in",
  );
  const [theme, setTheme] = useState<ThemeMode>(() =>
    readSetting("theme", ["light", "dark", "system"], "system"),
  );
  const [shoe, setShoe] = useState(
    () => readSetting("shoe", ["on", "off"], "off") === "on",
  );
  const [settingsWarning, setSettingsWarning] = useState("");
  function setPreference(key: string, value: string) {
    if (!saveSetting(key, value))
      setSettingsWarning(
        "Browser storage is unavailable; preferences will reset on refresh.",
      );
  }
  function chooseAccount(id: string) {
    setAccount(id);
    setSignedIn(true);
    setPreference("account", id);
    setPreference("session", "in");
  }
  function signOut() {
    activitySource.clear(account);
    setSignedIn(false);
    setPreference("session", "out");
  }
  return (
    <Theme theme={milemarkTheme} mode={theme}>
      <Workspace
        key={`${account}-${signedIn}`}
        account={account}
        signedIn={signedIn}
        chooseAccount={chooseAccount}
        signOut={signOut}
        theme={theme}
        setTheme={(value) => {
          setTheme(value);
          setPreference("theme", value);
        }}
        shoe={shoe}
        setShoe={(value) => {
          setShoe(value);
          setPreference("shoe", value ? "on" : "off");
        }}
        settingsWarning={settingsWarning}
      />
    </Theme>
  );
}

interface WorkspaceProps {
  account: string;
  signedIn: boolean;
  chooseAccount: (id: string) => void;
  signOut: () => void;
  theme: ThemeMode;
  setTheme: (value: ThemeMode) => void;
  shoe: boolean;
  setShoe: (value: boolean) => void;
  settingsWarning: string;
}
function Workspace({
  account,
  signedIn,
  chooseAccount,
  signOut,
  theme,
  setTheme,
  shoe,
  setShoe,
  settingsWarning,
}: WorkspaceProps) {
  const [tab, setTab] = useState("data");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null,
  );
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState<
    "connect" | "account" | "reset" | "privacy" | null
  >(null);
  const [loaded] = useState(() =>
    signedIn
      ? profileStorage.load(account)
      : { profile: structuredClone(DEFAULT_PROFILE) },
  );
  const [profile, setProfile] = useState<RunnerProfile>(loaded.profile);
  const [saveState, setSaveState] = useState(
    loaded.warning ?? "Saved on this device",
  );
  const [model, setModel] = useState("");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [modelError, setModelError] = useState("");
  const [modelLoading, setModelLoading] = useState(false);
  const [mode, setMode] = useState<"demo" | "strava">("demo");
  const [profileId, setProfileId] = useState(account);
  const [months, setMonths] = useState(3);
  const [coverage, setCoverage] = useState<HistoryCoverage | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const generation = useRef(0);
  const [clock, setClock] = useState(Date.now());
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("demo");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [fetching, setFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [strava, setStrava] = useState<StravaStatus>({
    state: "disconnected",
    message: "Connect your personal Strava account using the Strava API.",
  });
  const [connecting, setConnecting] = useState(false);
  const [checkingStrava, setCheckingStrava] = useState(true);
  const mounted = useRef(true);
  const runner =
    mode === "strava" && strava.athlete
      ? {
          name: strava.athlete.name,
          initials: strava.athlete.name
            .split(" ")
            .map((s) => s[0])
            .join("")
            .slice(0, 2),
        }
      : ACCOUNTS.find((a) => a.id === account)!;
  const today = mode === "demo" ? DEMO_DATE : localDate(new Date(clock));
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    purgeCoachingCache(clock);
    setActivities(old => { const fresh = old.filter(a => !a.expiresAt || a.expiresAt > clock); return fresh.length === old.length ? old : fresh; });
    if (analysisResult?.validUntil && analysisResult.validUntil <= clock) {
      setAnalysisResult(null);
      clearCoachingCache();
    }
  }, [clock, analysisResult]);
  async function refreshModels(force = false) {
    setModelLoading(true);
    setModelError("");
    try {
      const value = await loadModels(fetch, force);
      if (mounted.current) setModels(value);
    } catch (error) {
      if (mounted.current)
        setModelError(
          error instanceof Error ? error.message : "Could not load models.",
        );
    } finally {
      if (mounted.current) setModelLoading(false);
    }
  }
  useEffect(() => {
    void refreshModels();
  }, []);
  useEffect(() => {
    if (strava.state !== "connected" || !strava.athlete) return;
    const saved = profileStorage.forAthlete(strava.athlete.id, profile);
    setProfile(saved.profile);
    setProfileId(`strava-${strava.athlete.id}`);
    setMode("strava");
    setSaveState(
      saved.warning ?? "Saved for your Strava athlete on this browser",
    );
    setAnalysisResult(null);
    clearCoachingCache();
    setApiKey("");
  }, [strava.athlete?.id]);
  function useDemo() {
    setApiKey("");
    setMode("demo");
    setProfileId(account);
    const saved = profileStorage.load(account);
    setProfile(saved.profile);
    setSaveState(saved.warning ?? "Saved on this device");
    setAnalysisResult(null);
    clearCoachingCache();
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const url = new URL(window.location.href);
    const returned = url.searchParams.get("strava");
    if (returned) {
      setModal("connect");
      url.searchParams.delete("strava");
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
    stravaRequest("status")
      .then((value) => {
        if (!active) return;
        setStrava(
          returned === "invalid-state"
            ? {
                state: "error",
                code: "invalid-state",
                message:
                  "The sign-in attempt expired or could not be verified. Start Strava sign-in again.",
              }
            : returned === "connection-error"
              ? {
                  state: "error",
                  message:
                    "Could not complete Strava sign-in. Try connecting again.",
                }
              : value,
        );
      })
      .catch((error) => {
        if (active)
          setStrava({
            state: "setup-required",
            message:
              error instanceof Error
                ? error.message
                : "Strava sign-in is unavailable.",
          });
      })
      .finally(() => {
        if (active) setCheckingStrava(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function openStrava() {
    setDrawer(false);
    setModal("connect");
    if (strava.state !== "setup-required") return;
    setCheckingStrava(true);
    try {
      const value = await stravaRequest("status");
      if (mounted.current) setStrava(value);
    } catch (error) {
      if (mounted.current)
        setStrava({
          state: "setup-required",
          message:
            error instanceof Error
              ? error.message
              : "Strava sign-in is unavailable.",
        });
    } finally {
      if (mounted.current) setCheckingStrava(false);
    }
  }
  async function connectStrava() {
    setConnecting(true);
    try {
      if (strava.state === "expired")
        await stravaRequest("connection", "DELETE");
      const value = await stravaRequest("connect", "POST");
      if (!mounted.current) return;
      if (value.authorizationUrl) {
        window.location.assign(value.authorizationUrl);
        return;
      }
      setStrava(value);
    } catch (error) {
      if (mounted.current)
        setStrava({
          state: "error",
          message:
            error instanceof Error
              ? error.message
              : "Strava sign-in could not start.",
        });
    }
    if (mounted.current) setConnecting(false);
  }
  async function disconnectStrava() {
    setConnecting(true);
    try {
      const value = await stravaRequest("connection", "DELETE");
      if (mounted.current) {
        setStrava(value);
        if (value.state === "disconnected") {
          setActivities([]);
          setCoverage(null);
          setApiKey("");
          setAnalysisResult(null);
          clearCoachingCache();
          setMode("demo");
          setProfileId(account);
          setProfile(profileStorage.load(account).profile);
        }
      }
      return value.state === "disconnected";
    } catch (error) {
      if (mounted.current)
        setStrava({
          state: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not disconnect Strava. Try again.",
        });
      return false;
    } finally {
      if (mounted.current) setConnecting(false);
    }
  }
  async function signOutWithStrava() {
    if (!(await disconnectStrava())) return;
    setApiKey("");
    setShowKey(false);
    setModal(null);
    signOut();
  }
  useEffect(() => {
    const epoch = ++generation.current;
    setApiKey('');
    setActivities([]);
    setCoverage(null);
    setNextBefore(null);
    setSourceError("");
    setHistoryLoading(false);
    setAnalysisResult(null);
    clearCoachingCache();
    if (!signedIn) return;
    setFetching(true);
    const pending =
      mode === "demo"
        ? activitySource
            .list(account)
            .then((value) => ({
              activities: value,
              nextBefore: null,
              fetchedAt: Date.now(),
            }))
        : stravaData<ActivityPage>("activities");
    pending
      .then((value) => {
        if (epoch === generation.current) {
          setActivities(value.activities);
          setNextBefore(value.nextBefore);
          setLastUpdated(new Date(value.fetchedAt).toLocaleTimeString("en-IN"));
        }
      })
      .catch((error) => {
        if (epoch === generation.current) sourceFailure(error);
      })
      .finally(() => {
        if (epoch === generation.current) setFetching(false);
      });
    return () => {
      generation.current++;
    };
  }, [mode, account, signedIn, strava.athlete?.id]);
  function sourceFailure(error: unknown) {
    setSourceError(
      error instanceof Error ? error.message : "Could not load activity data.",
    );
    if (error instanceof StravaApiError && error.state === "expired") {
      setStrava({
        state: "expired",
        canDisconnect: true,
        message: error.message,
      });
      setActivities([]);
      setCoverage(null);
      setAnalysisResult(null);
      clearCoachingCache();
    }
  }
  async function refresh() {
    const epoch = generation.current;
    setFetching(true);
    setSourceError("");
    try {
      const value =
        mode === "demo"
          ? {
              activities: await activitySource.list(account, true),
              nextBefore: null,
              fetchedAt: Date.now(),
            }
          : await stravaData<ActivityPage>("activities?refresh=1");
      if (epoch !== generation.current) return;
      setActivities(value.activities);
      setNextBefore(value.nextBefore);
      setCoverage(null);
      setAnalysisResult(null);
      clearCoachingCache();
      setLastUpdated(new Date(value.fetchedAt).toLocaleTimeString("en-IN"));
      setConnection(
        mode === "demo" ? "demo" : value.activities.length ? "stale" : "empty",
      );
    } catch (error) {
      if (epoch === generation.current) sourceFailure(error);
    } finally {
      if (epoch === generation.current) setFetching(false);
    }
  }
  async function loadMore() {
    if (!nextBefore) return;
    const epoch = generation.current;
    setFetching(true);
    setSourceError("");
    try {
      const value = await stravaData<ActivityPage>(
        `activities?before=${nextBefore}`,
      );
      if (epoch !== generation.current) return;
      setActivities((old) =>
        [
          ...new Map(
            [...old, ...value.activities].map((a) => [a.id, a]),
          ).values(),
        ].sort((a, b) => b.date.localeCompare(a.date)),
      );
      setNextBefore(value.nextBefore);
    } catch (error) {
      if (epoch === generation.current) sourceFailure(error);
    } finally {
      if (epoch === generation.current) setFetching(false);
    }
  }
  async function detail(id: string): Promise<void> {
    if (mode !== "strava") return;
    const epoch = generation.current;
    try {
      const value = await stravaData<Activity>(`activities/${id}`);
      if (epoch === generation.current)
        setActivities((old) => old.map((a) => (a.id === id ? value : a)));
    } catch (error) {
      if (epoch === generation.current) {
        if (error instanceof StravaApiError && error.status === 404) {
          setActivities((old) => old.filter((a) => a.id !== id));
          setAnalysisResult(null);
          clearCoachingCache();
        }
        sourceFailure(error);
      }
      throw error;
    }
  }
  async function loadHistory(selectedMonths = months, withDetails = false) {
    if (mode !== "strava" || historyLoading) return;
    const epoch = generation.current,
      after = [
        monthsAgo(today, selectedMonths),
        addDays(mondayOf(today), -28),
      ].sort()[0];
    setHistoryLoading(true);
    setSourceError("");
    try {
      const rows = new Map<string, Activity>();
      let before: number | null = null;
      let complete = false;
      for (let page = 0; page < 20; page++) {
        const data: ActivityPage = await stravaData<ActivityPage>(
          `activities?limit=100&after=${Math.floor(new Date(`${after}T00:00:00+05:30`).getTime() / 1000)}${before ? `&before=${before}` : ""}`,
        );
        if (epoch !== generation.current) return;
        data.activities.forEach((a) => rows.set(a.id, a));
        if (data.nextBefore === null) {
          complete = true;
          break;
        }
        if (data.nextBefore === before) break;
        before = data.nextBefore;
      }
      setActivities((old) => {
        const detailed = new Map(
          old.filter((a) => a.detailLoaded).map((a) => [a.id, a]),
        );
        return [...rows.values()]
          .map((a) => detailed.get(a.id) ?? a)
          .sort((a, b) => b.date.localeCompare(a.date));
      });
      setCoverage({ after, through: today, complete });
      setNextBefore(null);
      if (withDetails) {
        const runs = [...rows.values()].filter(isRun);
        for (let i = 0; i < runs.length; i += 2) {
          if (epoch !== generation.current) return;
          await Promise.all(runs.slice(i, i + 2).map((a) => detail(a.id)));
        }
      }
    } catch (error) {
      if (epoch === generation.current) sourceFailure(error);
    } finally {
      if (epoch === generation.current) setHistoryLoading(false);
    }
  }
  const visibleActivities = activities.filter(
    (a) => !a.expiresAt || a.expiresAt > clock,
  );
  const updateProfile = (value: RunnerProfile) => {
    setProfile(value);
    const validation = validateProfile(value);
    if (validation) {
      setSaveState(validation);
      return;
    }
    try {
      profileStorage.save(profileId, value);
      setSaveState("Saved on this device");
    } catch {
      setSaveState(
        "Could not save. Keep this page open and try editing again.",
      );
    }
  };
  const changeModel = (value: string | null) => {
    if (value) {
      setModel(value);
      if (!saveSetting(`model.${account}`, value))
        setSaveState("Model preference could not be saved on this device.");
    }
  };
  function resetProfile() {
    try {
      profileStorage.reset(profileId);
      setProfile(structuredClone(DEFAULT_PROFILE));
      setSaveState("Context reset on this device");
      setModal(null);
    } catch {
      setSaveState("Could not reset browser storage.");
      setModal(null);
    }
  }
  const sidebar = (
    <VStack className="sidebar-inner" gap={0}>
      <Brand />
      <p className="sidebar-tagline">Every mile, with intention.</p>
      <p className="eyebrow sidebar-section-label">YOUR WORKSPACE</p>
      <nav aria-label="Workspace" className="side-navigation">
        <Button
          className={`side-nav-button ${tab === "data" ? "selected" : ""}`}
          variant="ghost"
          label="Your data"
          icon={<Icon name="chart" />}
          onClick={() => {
            setTab("data");
            setDrawer(false);
          }}
        />
        <Button
          className={`side-nav-button ${tab === "analysis" ? "selected" : ""}`}
          variant="ghost"
          label="Your analysis"
          icon={<Icon name="spark" />}
          onClick={() => {
            setTab("analysis");
            setDrawer(false);
          }}
        />
      </nav>
      <section className="sidebar-section">
        <HStack hAlign="between" vAlign="center">
          <p className="eyebrow">CONNECTIONS</p>
          <small>Personal API</small>
        </HStack>
        <HStack className="strava-source" gap={3} vAlign="center">
          <strong className="strava-logo" aria-hidden="true">
            S
          </strong>
          <VStack gap={0}>
            <strong>Strava</strong>
            <small role="status">
              {checkingStrava
                ? "Checking connection…"
                : strava.state === "connected"
                  ? "Connected · Strava API"
                  : strava.state === "authorizing"
                    ? "Sign-in in progress"
                    : "Not connected"}
            </small>
          </VStack>
        </HStack>
        <Button
          label={
            strava.state === "connected" ? "Manage Strava" : "Connect Strava"
          }
          variant="secondary"
          width="100%"
          icon={<Icon name="link" size={16} />}
          onClick={openStrava}
        />
        <p className="sidebar-help">
          {strava.state === "connected"
            ? "Read-only activities from your own account."
            : "Sign in securely on Strava."}
        </p>
      </section>
      <section className="sidebar-section ai-section">
        <HStack hAlign="between" vAlign="center">
          <p className="eyebrow">YOUR AI COACH</p>
          <Icon name="spark" size={16} />
        </HStack>
        <TextInput
          label="OpenRouter API key"
          type={showKey ? "text" : "password"}
          value={apiKey}
          onChange={setApiKey}
          placeholder="Your key goes here"
          autoComplete="off"
          hasSpellCheck={false}
          size="sm"
        />
        <HStack hAlign="between" className="key-actions">
          <Button
            size="sm"
            label={showKey ? "Hide key" : "Reveal key"}
            variant="ghost"
            onClick={() => setShowKey(!showKey)}
          />
          <Button
            size="sm"
            label="Clear"
            variant="ghost"
            isDisabled={!apiKey}
            onClick={() => {
              setApiKey("");
              setShowKey(false);
            }}
          />
        </HStack>
        <Selector
          label="Model"
          value={model}
          options={models.map((m) => ({
            value: m.id,
            label: m.name,
            description: m.detail,
          }))}
          placeholder="Choose a model"
          isLoading={modelLoading}
          onChange={changeModel}
          hasSearch
          size="sm"
          width="100%"
        />
        <p className="sidebar-help">
          <Icon name="shield" size={13} />
          Key stays in this tab. Context goes to OpenRouter only when you
          generate.
        </p>
        {modelError && <p role="alert">{modelError}</p>}
        <Button
          label="Refresh models"
          variant="ghost"
          size="sm"
          isLoading={modelLoading}
          onClick={() => refreshModels(true)}
        />
      </section>
      <section className="sidebar-race">
        <Icon name="flag" size={20} />
        <p>
          One goal.
          <br />
          <strong>Many good miles.</strong>
        </p>
        <small>
          {profile.goal === "Custom goal"
            ? profile.customGoal || "Your next chapter"
            : profile.goal}
        </small>
      </section>
      <section className="sidebar-bottom">
        <Selector
          label="Appearance"
          isLabelHidden
          value={theme}
          onChange={(value) => value && setTheme(value as ThemeMode)}
          options={[
            { value: "light", label: "Light mode" },
            { value: "dark", label: "Dark mode" },
            { value: "system", label: "System theme" },
          ]}
          startIcon={
            <Icon
              name={
                theme === "dark"
                  ? "moon"
                  : theme === "light"
                    ? "sun"
                    : "monitor"
              }
              size={17}
            />
          }
          size="sm"
          variant="ghost"
        />
        <Button
          className="account-trigger"
          label={signedIn ? runner.name : "Sign in preview"}
          variant="ghost"
          onClick={() => {
            setDrawer(false);
            setModal("account");
          }}
          icon={
            <strong className="avatar">
              {signedIn ? runner.initials : "?"}
            </strong>
          }
        />
        <small className="account-caption">
          {signedIn
            ? mode === "strava"
              ? "Personal athlete · local saves"
              : "Demo profile · local saves"
            : "No account connected"}
        </small>
      </section>
    </VStack>
  );

  return (
    <VStack className={`app ${shoe ? "shoe-cursor" : ""}`} gap={0}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="desktop-sidebar">{sidebar}</aside>
      <Drawer
        isOpen={drawer}
        onOpenChange={setDrawer}
        label="Milemark navigation and settings"
        side="start"
        width={300}
        padding={0}
      >
        <HStack className="drawer-close" hAlign="end">
          <Button
            isIconOnly
            label="Close navigation"
            icon={<Icon name="close" />}
            variant="ghost"
            onClick={() => setDrawer(false)}
          />
        </HStack>
        {sidebar}
      </Drawer>
      <VStack className="workspace" gap={0}>
        <header className="topbar">
          <HStack gap={3} vAlign="center">
            <Button
              className="mobile-menu"
              label="Open navigation"
              isIconOnly
              icon={<Icon name="menu" />}
              variant="ghost"
              onClick={() => setDrawer(true)}
            />
            <TabList
              role="tablist"
              value={tab}
              onChange={setTab}
              aria-label="Main sections"
            >
              <Tab
                value="data"
                label="Data"
                panelId="data-panel"
                icon={<Icon name="chart" size={17} />}
              />
              <Tab
                value="analysis"
                label="Analysis"
                panelId="analysis-panel"
                icon={<Icon name="spark" size={17} />}
              />
            </TabList>
          </HStack>
          <HStack gap={3} vAlign="center">
            <p className="demo-pill">
              <i />
              {mode === "strava" ? "Personal workspace" : "Demo workspace"}
            </p>
            <strong className="top-avatar" aria-label={runner.name}>
              {runner.initials}
            </strong>
          </HStack>
        </header>
        <main id="main" className="main-content" tabIndex={-1}>
          {settingsWarning && <Note warning>{settingsWarning}</Note>}
          {!signedIn ? (
            <section className="signed-out">
              <Icon name="shield" size={42} />
              <h1>A fresh start awaits.</h1>
              <p>Your saved context stays private to your demo profile.</p>
              <Button
                label="Open sign-in preview"
                variant="primary"
                onClick={() => setModal("account")}
              />
            </section>
          ) : (
            <>
              {sourceError && <Note warning>{sourceError}</Note>}
              <section
                id="data-panel"
                role="tabpanel"
                aria-label="Data"
                hidden={tab !== "data"}
              >
                {tab === "data" && (
                  <DataView
                    activities={visibleActivities.filter(isRun)}
                    connection={mode === "demo" ? connection : "demo"}
                    live={mode === "strava"}
                    today={today}
                    onDetail={detail}
                    loadMore={loadMore}
                    hasMore={nextBefore !== null}
                    fetching={fetching}
                    lastUpdated={lastUpdated}
                    refresh={refresh}
                    onConnect={openStrava}
                    onAnalysis={() => setTab("analysis")}
                    profile={profile}
                  />
                )}
              </section>
              <section
                id="analysis-panel"
                role="tabpanel"
                aria-label="Analysis"
                hidden={tab !== "analysis"}
              >
                {tab === "analysis" && (
                  <AnalysisView
                    key={`${profileId}-${mode}`}
                    profile={profile}
                    onProfileChange={updateProfile}
                    saveState={saveState}
                    model={model}
                    apiKey={apiKey}
                    modelName={
                      models.find((m) => m.id === model)?.name ?? model
                    }
                    activities={visibleActivities}
                    live={mode === "strava"}
                    today={today}
                    months={months}
                    setMonths={setMonths}
                    coverage={coverage}
                    loadHistory={loadHistory}
                    historyLoading={historyLoading}
                    result={analysisResult}
                    onResult={setAnalysisResult}
                  />
                )}
              </section>
            </>
          )}
        </main>
        <footer className="footer">
          <p>Built for the long run.</p>
          <HStack gap={4} wrap="wrap">
            <small>
              {mode === "strava"
                ? "Personal Strava activity data"
                : "Illustrative activity data"}
            </small>
            <button onClick={() => setModal("privacy")}>
              Privacy & settings
            </button>
          </HStack>
        </footer>
      </VStack>
      <Modal
        title="Connect your miles"
        subtitle="Strava API · personal read-only access"
        open={modal === "connect"}
        onClose={() => setModal(null)}
      >
        <p>
          Sign in on Strava to grant read-only access. Your password never enters Milemark.
        </p>
        <section role="status" aria-live="polite">
          <Note
            warning={
              !["connected", "disconnected", "authorizing"].includes(
                strava.state,
              )
            }
          >
            {checkingStrava ? "Checking your connection…" : strava.message}
          </Note>
        </section>
        {strava.state !== 'setup-required' && <p>Configure your Strava API application locally. Its callback domain is localhost.</p>}
        {strava.state !== "connected" && (
          <Button
            label={
              strava.state === "expired" || strava.state === "authorizing"
                ? "Reconnect Strava"
                : "Sign in with Strava"
            }
            variant="primary"
            isLoading={connecting}
            isDisabled={checkingStrava}
            icon={<Icon name="link" size={16} />}
            onClick={connectStrava}
          />
        )}
        {strava.canDisconnect && (
          <Button
            label="Disconnect Strava"
            variant="secondary"
            isLoading={connecting}
            isDisabled={checkingStrava}
            onClick={disconnectStrava}
          />
        )}
        <Note>
          Generate coaching sends summaries and saved context to OpenRouter. GPS and Strava credentials are excluded.
        </Note>
        <Button
          label="Continue with demo activities"
          variant="ghost"
          onClick={() => {
            useDemo();
            setModal(null);
          }}
        />
      </Modal>
      <Modal
        title="Your personal workspace"
        subtitle="Local profiles"
        open={modal === "account"}
        onClose={() => setModal(null)}
      >
        <p>
          Your training context is saved on this browser, separately for each
          Strava athlete. Nothing syncs to a hosted account.
        </p>
        {strava.athlete && strava.state === "connected" && (
          <Button
            label={`Use ${strava.athlete.name}’s Strava data`}
            onClick={() => {
              const saved = profileStorage.forAthlete(
                strava.athlete!.id,
                profile,
              );
              setProfile(saved.profile);
              setProfileId(`strava-${strava.athlete!.id}`);
              setMode("strava");
              setModal(null);
            }}
          />
        )}
        <Button
          label="Explore demo data"
          onClick={() => {
            useDemo();
            chooseAccount(account);
            setModal(null);
          }}
        />
        {signedIn && (
          <Button
            label="Sign out and disconnect"
            variant="ghost"
            icon={<Icon name="logout" />}
            isLoading={connecting}
            onClick={signOutWithStrava}
          />
        )}
        {strava.state === "error" && <Note warning>{strava.message}</Note>}
      </Modal>
      <Modal
        title="Privacy & preferences"
        open={modal === "privacy"}
        onClose={() => setModal(null)}
      >
        <Note>
          This app runs locally. Strava REST supplies activities; OpenRouter and
          your selected model provider process coaching context when you
          generate.
        </Note>
        <p>
          Strava credentials and activity caches are encrypted in the local
          Netlify Blobs emulator. This browser receives only an HttpOnly
          connection cookie. Disconnect removes the session and attempts to
          revoke Strava access. No hosting or cloud profile synchronization is
          enabled.
        </p>
        <p>
          Training context is saved separately for each athlete and demo profile
          in this browser. Theme, cursor, and model preferences are also saved.
          Your OpenRouter key stays in memory until you refresh or sign out.
        </p>
        <Switch
          label="Running-shoe cursor"
          description="Optional, on devices with a mouse."
          value={shoe}
          onChange={setShoe}
        />
        <Button
          label="Reset this profile’s saved context"
          variant="destructive"
          onClick={() => setModal("reset")}
        />
        <small>
          Aimé typography will activate when licensed font files are added. This
          preview uses a serif fallback.
        </small>
      </Modal>
      <Modal
        title="Reset your saved context?"
        subtitle="Only the current demo profile will be reset."
        open={modal === "reset"}
        onClose={() => setModal(null)}
      >
        <p>
          This removes your edits and restores the sample goals, diet, and
          schedule on this device.
        </p>
        <HStack gap={3}>
          <Button label="Keep my context" onClick={() => setModal(null)} />
          <Button
            label="Reset context"
            variant="destructive"
            onClick={resetProfile}
          />
        </HStack>
      </Modal>
    </VStack>
  );
}
