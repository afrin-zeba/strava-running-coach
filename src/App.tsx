import { useEffect, useRef, useState } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { Drawer } from '@astryxdesign/core/Drawer';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { ACCOUNTS, activitySource, profileStorage, readSetting, saveSetting, validateProfile } from './services';
import { DEFAULT_PROFILE, MODELS } from './data';
import { milemarkTheme } from './theme-built/milemark.js';
import { Brand, Button, HStack, Icon, Modal, Note, TrackArt, VStack } from './ui';
import { DataView } from './views/DataView';
import { AnalysisView } from './views/AnalysisView';
import type { Activity, AnalysisResult, ConnectionState, RunnerProfile, ThemeMode } from './types';

export default function App() {
  const [account, setAccount] = useState(() => readSetting('account', ACCOUNTS.map(a => a.id), 'runner-one'));
  const [signedIn, setSignedIn] = useState(() => readSetting('session', ['in', 'out'], 'in') === 'in');
  const [theme, setTheme] = useState<ThemeMode>(() => readSetting('theme', ['light', 'dark', 'system'], 'system'));
  const [shoe, setShoe] = useState(() => readSetting('shoe', ['on', 'off'], 'off') === 'on');
  const [settingsWarning, setSettingsWarning] = useState('');
  function setPreference(key: string, value: string) { if (!saveSetting(key, value)) setSettingsWarning('Browser storage is unavailable; preferences will reset on refresh.'); }
  function chooseAccount(id: string) { setAccount(id); setSignedIn(true); setPreference('account', id); setPreference('session', 'in'); }
  function signOut() { activitySource.clear(account); setSignedIn(false); setPreference('session', 'out'); }
  return <Theme theme={milemarkTheme} mode={theme}>
    <Workspace key={`${account}-${signedIn}`} account={account} signedIn={signedIn} chooseAccount={chooseAccount} signOut={signOut}
      theme={theme} setTheme={value => { setTheme(value); setPreference('theme', value); }} shoe={shoe}
      setShoe={value => { setShoe(value); setPreference('shoe', value ? 'on' : 'off'); }} settingsWarning={settingsWarning} />
  </Theme>;
}

interface WorkspaceProps {
  account: string; signedIn: boolean; chooseAccount: (id: string) => void; signOut: () => void;
  theme: ThemeMode; setTheme: (value: ThemeMode) => void; shoe: boolean; setShoe: (value: boolean) => void; settingsWarning: string;
}
function Workspace({ account, signedIn, chooseAccount, signOut, theme, setTheme, shoe, setShoe, settingsWarning }: WorkspaceProps) {
  const [tab, setTab] = useState('data');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [modal, setModal] = useState<'connect' | 'account' | 'reset' | 'privacy' | null>(null);
  const [loaded] = useState(() => signedIn ? profileStorage.load(account) : { profile: structuredClone(DEFAULT_PROFILE) });
  const [profile, setProfile] = useState<RunnerProfile>(loaded.profile);
  const [saveState, setSaveState] = useState(loaded.warning ?? 'Saved on this device · cloud sync preview');
  const [model, setModel] = useState(() => readSetting(`model.${account}`, MODELS.map(m => m.id), MODELS[0].id));
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>('demo');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [fetching, setFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [sourceError, setSourceError] = useState('');
  const mounted = useRef(true);
  const runner = ACCOUNTS.find(a => a.id === account)!;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    setFetching(true);
    activitySource.list(account).then(value => { if (active) { setActivities(value); setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })); } }).catch(() => { if (active) setSourceError('The demo activity source could not be loaded. Try refreshing.'); }).finally(() => { if (active) setFetching(false); });
    return () => { active = false; };
  }, [account, signedIn]);
  async function refresh() {
    setFetching(true); setSourceError('');
    try { const value = await activitySource.list(account, true); if (mounted.current) { setActivities(value); setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })); setConnection('demo'); } }
    catch { if (mounted.current) setSourceError('Could not refresh. Your previous activities are still available.'); }
    finally { if (mounted.current) setFetching(false); }
  }
  const updateProfile = (value: RunnerProfile) => {
    setProfile(value);
    const validation = validateProfile(value);
    if (validation) { setSaveState(validation); return; }
    try { profileStorage.save(account, value); setSaveState('Saved on this device · cloud sync preview'); }
    catch { setSaveState('Could not save. Keep this page open and try editing again.'); }
  };
  const changeModel = (value: string | null) => { if (value) { setModel(value); if (!saveSetting(`model.${account}`, value)) setSaveState('Model preference could not be saved on this device.'); } };
  function resetProfile() {
    try { profileStorage.reset(account); setProfile(structuredClone(DEFAULT_PROFILE)); setSaveState('Context reset on this device · cloud sync preview'); setModal(null); }
    catch { setSaveState('Could not reset browser storage.'); setModal(null); }
  }
  const sidebar = <VStack className="sidebar-inner" gap={0}>
    <Brand />
    <p className="sidebar-tagline">Every mile, with intention.</p>
    <p className="eyebrow sidebar-section-label">YOUR WORKSPACE</p>
    <nav aria-label="Workspace" className="side-navigation">
      <Button className={`side-nav-button ${tab === 'data' ? 'selected' : ''}`} variant="ghost" label="Your data" icon={<Icon name="chart" />} onClick={() => { setTab('data'); setDrawer(false); }} />
      <Button className={`side-nav-button ${tab === 'analysis' ? 'selected' : ''}`} variant="ghost" label="Your analysis" icon={<Icon name="spark" />} onClick={() => { setTab('analysis'); setDrawer(false); }} />
    </nav>
    <section className="sidebar-section">
      <HStack hAlign="between" vAlign="center"><p className="eyebrow">CONNECTIONS</p><small className="demo-label">Demo</small></HStack>
      <HStack className="strava-source" gap={3} vAlign="center"><strong className="strava-logo" aria-hidden="true">S</strong><VStack gap={0}><strong>Strava</strong><small>{connection === 'demo' ? 'Sample activities' : 'Not connected'}</small></VStack></HStack>
      <Button label="Connect Strava" variant="secondary" width="100%" icon={<Icon name="link" size={16} />} onClick={() => { setDrawer(false); setModal('connect'); }} />
      <p className="sidebar-help">Live connection coming soon.</p>
    </section>
    <section className="sidebar-section ai-section">
      <HStack hAlign="between" vAlign="center"><p className="eyebrow">YOUR AI COACH</p><Icon name="spark" size={16} /></HStack>
      <TextInput label="OpenRouter API key" type={showKey ? 'text' : 'password'} value={apiKey} onChange={setApiKey} placeholder="Your key goes here" autoComplete="off" hasSpellCheck={false} size="sm" />
      <HStack hAlign="between" className="key-actions"><Button size="sm" label={showKey ? 'Hide key' : 'Reveal key'} variant="ghost" onClick={() => setShowKey(!showKey)} /><Button size="sm" label="Clear" variant="ghost" isDisabled={!apiKey} onClick={() => { setApiKey(''); setShowKey(false); }} /></HStack>
      <Selector label="Model" value={model} options={MODELS.map(m => ({ value: m.id, label: m.name, description: m.detail }))} onChange={changeModel} hasSearch size="sm" width="100%" />
      <p className="sidebar-help"><Icon name="shield" size={13} />Key stays in this tab. No AI calls in demo.</p>
    </section>
    <section className="sidebar-race"><Icon name="flag" size={20} /><p>One goal.<br /><strong>Many good miles.</strong></p><small>{profile.goal === 'Custom goal' ? profile.customGoal || 'Your next chapter' : profile.goal}</small></section>
    <section className="sidebar-bottom">
      <Selector label="Appearance" isLabelHidden value={theme} onChange={value => value && setTheme(value as ThemeMode)} options={[{ value: 'light', label: 'Light mode' }, { value: 'dark', label: 'Dark mode' }, { value: 'system', label: 'System theme' }]} startIcon={<Icon name={theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor'} size={17} />} size="sm" variant="ghost" />
      <Button className="account-trigger" label={signedIn ? runner.name : 'Sign in preview'} variant="ghost" onClick={() => { setDrawer(false); setModal('account'); }} icon={<strong className="avatar">{signedIn ? runner.initials : '?'}</strong>} />
      <small className="account-caption">{signedIn ? 'Demo account · local saves' : 'No account connected'}</small>
    </section>
  </VStack>;

  return <VStack className={`app ${shoe ? 'shoe-cursor' : ''}`} gap={0}>
    <a className="skip-link" href="#main">Skip to content</a>
    <aside className="desktop-sidebar">{sidebar}</aside>
    <Drawer isOpen={drawer} onOpenChange={setDrawer} label="Milemark navigation and settings" side="start" width={300} padding={0}>
      <HStack className="drawer-close" hAlign="end"><Button isIconOnly label="Close navigation" icon={<Icon name="close" />} variant="ghost" onClick={() => setDrawer(false)} /></HStack>{sidebar}
    </Drawer>
    <VStack className="workspace" gap={0}>
      <header className="topbar">
        <HStack gap={3} vAlign="center"><Button className="mobile-menu" label="Open navigation" isIconOnly icon={<Icon name="menu" />} variant="ghost" onClick={() => setDrawer(true)} /><TabList role="tablist" value={tab} onChange={setTab} aria-label="Main sections"><Tab value="data" label="Data" panelId="data-panel" icon={<Icon name="chart" size={17} />} /><Tab value="analysis" label="Analysis" panelId="analysis-panel" icon={<Icon name="spark" size={17} />} /></TabList></HStack>
        <HStack gap={3} vAlign="center"><p className="demo-pill"><i />Demo workspace</p><strong className="top-avatar" aria-label={runner.name}>{runner.initials}</strong></HStack>
      </header>
      <main id="main" className="main-content" tabIndex={-1}>
        {settingsWarning && <Note warning>{settingsWarning}</Note>}
        {!signedIn ? <section className="signed-out"><Icon name="shield" size={42} /><h1>A fresh start awaits.</h1><p>Your saved context stays private to your demo profile.</p><Button label="Open sign-in preview" variant="primary" onClick={() => setModal('account')} /></section> : <>
          {sourceError && <Note warning>{sourceError}</Note>}
          <section id="data-panel" role="tabpanel" aria-label="Data" hidden={tab !== 'data'}>{tab === 'data' && <DataView activities={activities} connection={connection} fetching={fetching} lastUpdated={lastUpdated} refresh={refresh} onConnect={() => setModal('connect')} onAnalysis={() => setTab('analysis')} profile={profile} />}</section>
          <section id="analysis-panel" role="tabpanel" aria-label="Analysis" hidden={tab !== 'analysis'}>{tab === 'analysis' && <AnalysisView profile={profile} onProfileChange={updateProfile} saveState={saveState} model={model} activities={activities} result={analysisResult} onResult={setAnalysisResult} />}</section>
        </>}
      </main>
      <footer className="footer"><p>Built for the long run.</p><HStack gap={4} wrap="wrap"><small>Illustrative data · no live connections</small><button onClick={() => setModal('privacy')}>Privacy & settings</button></HStack></footer>
    </VStack>
    <Modal title="Connect your miles" subtitle="Strava integration preview" open={modal === 'connect'} onClose={() => setModal(null)}>
      <Note>This release uses synthetic activities. No Strava login, account check, or data transfer happens here.</Note>
      <p>The official Strava MCP requires an active subscription. Live access for this hosted app is still subject to Strava authorization.</p>
      <Button label="Continue with demo activities" variant="primary" onClick={() => { setConnection('demo'); setModal(null); }} />
      <details className="preview-scenarios"><summary>Explore connection states</summary><p>Preview how connection issues will be explained. These do not check your actual account.</p><VStack gap={2}>
        {([['subscription-required', 'Subscription required'], ['expired', 'Expired sign-in'], ['rate-limit', 'Rate limit'], ['error', 'Service error'], ['empty', 'No activity history'], ['stale', 'Stale activities'], ['disconnected', 'Disconnected']] as [ConnectionState, string][]).map(([value, label]) => <Button key={value} label={label} size="sm" variant="secondary" onClick={() => { setConnection(value); setTab('data'); setModal(null); }} />)}
      </VStack></details>
    </Modal>
    <Modal title="Your space, wherever you run" subtitle="Account and cloud sync preview" open={modal === 'account'} onClose={() => setModal(null)}>
      <p>Live sign-in will use Netlify Identity. For now, switch between two separate demo profiles saved on this browser. Nothing syncs across devices yet.</p>
      {ACCOUNTS.map(a => <Button key={a.id} label={`${a.name}${signedIn && a.id === account ? ' · current' : ''}`} variant={a.id === account && signedIn ? 'primary' : 'secondary'} onClick={() => { chooseAccount(a.id); setModal(null); }} />)}
      {signedIn && <Button label="Sign out of demo profile" variant="ghost" icon={<Icon name="logout" />} onClick={() => { setApiKey(''); setShowKey(false); setModal(null); signOut(); }} />}
    </Modal>
    <Modal title="Privacy & preferences" open={modal === 'privacy'} onClose={() => setModal(null)}>
      <Note>No Strava, OpenRouter, or cloud requests are made in this demo.</Note>
      <p>Training context is saved separately for each demo profile in this browser. Theme, cursor, and model preferences are also saved. Your OpenRouter key stays in memory until you refresh or sign out.</p>
      <Switch label="Running-shoe cursor" description="Optional, on devices with a mouse." value={shoe} onChange={setShoe} />
      <Button label="Reset this profile’s saved context" variant="destructive" onClick={() => setModal('reset')} />
      <small>Aimé typography will activate when licensed font files are added. This preview uses a serif fallback.</small>
    </Modal>
    <Modal title="Reset your saved context?" subtitle="Only the current demo profile will be reset." open={modal === 'reset'} onClose={() => setModal(null)}>
      <p>This removes your edits and restores the sample goals, diet, and schedule on this device.</p><HStack gap={3}><Button label="Keep my context" onClick={() => setModal(null)} /><Button label="Reset context" variant="destructive" onClick={resetProfile} /></HStack>
    </Modal>
  </VStack>;
}
