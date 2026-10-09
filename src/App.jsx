import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Activity, AlertTriangle, Bell, Bot, CheckCircle2, ChevronRight, Clock3,
  Droplets, Gauge, LayoutDashboard, MapPinned, RefreshCw, Send, Settings2,
  ShieldCheck, Sparkles, TrendingUp, Wallet, Waves, Zap, CircleHelp,
  Mic, MicOff, VolumeX, Ear
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  BarChart, Bar
} from 'recharts';
import './App.css';
import { useVoiceAssistant } from './useVoiceAssistant';
const API = 'http://127.0.0.1:8001';
const NAV = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Analytics', icon: TrendingUp },
  { name: 'Zones', icon: MapPinned },
  { name: 'Alerts', icon: Bell },
  { name: 'AI Assistant', icon: Bot },
  { name: 'Settings', icon: Settings2 },
];
const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 });
const timeText = (mins) => {
  if (mins === null || mins === undefined || !Number.isFinite(Number(mins))) return 'Not enough data';
  const total = Math.max(0, Math.round(Number(mins)));
  const h = Math.floor(total / 60), m = total % 60;
  return h ? `${h}h ${m}m` : `${m} min`;
};

function App() {
  const [page, setPage] = useState('Dashboard');
  const [status, setStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [checkedAt, setCheckedAt] = useState(null);
  const [oneTouch, setOneTouch] = useState(false);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState([{ role: 'assistant', text: 'Hi! I can explain current tank level, usage, refill guidance and unusual-flow alerts. NeerIQ demo values are simulated.' }]);
  const [asking, setAsking] = useState(false);
  const [settings, setSettings] = useState({ capacity: 4000, threshold: 30, tariff: 25, interval: 5 });

  const loadData = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [s, h, a, i] = await Promise.all([
        fetch(`${API}/api/water-status`), fetch(`${API}/api/water-history`),
        fetch(`${API}/api/analytics`), fetch(`${API}/api/ai-insight`)
      ]);
      if (![s, h, a, i].every(r => r.ok)) throw new Error('Backend returned an error.');
      const [sv, hv, av, iv] = await Promise.all([s.json(), h.json(), a.json(), i.json()]);
      setStatus(sv); setHistory(Array.isArray(hv.data) ? hv.data : []); setAnalytics(av); setInsight(iv);
      setError(''); setCheckedAt(new Date());
    } catch (e) {
      setError('Cannot connect to NeerIQ backend. Start FastAPI at 127.0.0.1:8000.');
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); const id = setInterval(() => loadData(), 5000); return () => clearInterval(id); }, [loadData]);

  const level = Number(status?.tank_level ?? 0);
  const capacity = Number(settings.capacity || status?.tank_capacity || 4000);
  const litres = capacity * level / 100;
  const flow = Number(status?.flow_rate ?? 0);
  const remainingMinutes = flow > 0.1 ? litres / flow : null;
  const thresholdMinutes = flow > 0.1 ? Math.max(0, litres - capacity * settings.threshold / 100) / flow : null;
  const refillGuidance = level <= 15 ? 'Refill urgently: tank level is critically low.' : level <= settings.threshold ? 'Refill recommended: tank is at or below the configured threshold.' : `Current level is above the ${settings.threshold}% refill threshold.`;
  const isWarning = status?.system_health === 'ATTENTION REQUIRED' || status?.system_status === 'WARNING' || status?.system_status === 'CRITICAL';
  const notifications = analytics?.notifications || [];
  const chartData = useMemo(() => history.slice(-24).map((r, idx) => ({
    time: r.timestamp ? new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `R${idx + 1}`,
    flow: Number(r.flow_rate || 0), level: Number(r.tank_level || 0), usage: Number(r.daily_usage || 0)
  })), [history]);
  const zoneData = analytics?.zones || [];

  const {
    isListening, transcript, error: micError, lang, setLang, isSpeaking,
    isSupported, startListening, stopListening, clearTranscript, speak, stopSpeaking
  } = useVoiceAssistant();

  useEffect(() => {
    if (transcript) {
      setQuestion(transcript);
    }
  }, [transcript]);

  const askQuestion = async (text) => {
    const currentChat = [...chat, { role: 'user', text }];
    setChat(currentChat);
    setAsking(true);
    try {
      const r = await fetch(`${API}/api/ask`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ 
          question: text,
          history: chat.map(m => ({ role: m.role, text: m.text })).slice(-6)
        }) 
      });
      const data = await r.json(); if (!r.ok) throw new Error(data.detail || 'Request failed');
      setChat(prev => [...prev, { role: 'assistant', text: data.answer || 'No answer received.' }]);
      speak(data.answer || 'No answer received.');
    } catch { 
      const errText = 'I could not reach the backend. Check that FastAPI is running.';
      setChat(prev => [...prev, { role: 'assistant', text: errText }]); 
      speak(errText);
    } finally { setAsking(false); }
  };

  const checkStatus = async () => {
    setOneTouch(true);
    await loadData(true);
  };

  const sendQuestion = async (e) => {
    e?.preventDefault(); const q = question.trim(); if (!q || asking) return;
    setQuestion('');
    askQuestion(q);
  };

  const pageTitle = {
    Dashboard: 'Water command centre', Analytics: 'Water usage analytics', Zones: 'Zone monitoring',
    Alerts: 'Alerts & recommendations', 'AI Assistant': 'NeerIQ assistant', Settings: 'System settings'
  }[page];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Droplets size={23} /></div><div><b>NeerIQ</b><span>SMART WATER PLATFORM</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav>{NAV.map(({ name, icon: Icon }) => <button key={name} className={`nav-link ${page === name ? 'active' : ''}`} onClick={() => setPage(name)}><Icon size={18} /><span>{name}</span>{page === name && <ChevronRight className="nav-chevron" size={16} />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="live-dot" /><div><b>Demo system active</b><span>Simulated sensor feed</span></div></div>
      <div className="sidebar-foot">NeerIQ · PROTOTYPE 1.0</div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="crumb">NeerIQ <span>/</span> {page.toUpperCase()}</div>
        <div className="top-actions">
          <span className="demo-pill"><span /> SIMULATION MODE</span>
          <button className="icon-button" title="Refresh data" onClick={() => loadData(true)}><RefreshCw size={17} className={refreshing ? 'spin' : ''} /></button>
          <div className="avatar">A</div>
        </div>
      </header>
      <div className="page-wrap">
        <div className="page-heading"><div><div className="eyebrow">SMART WATER INTELLIGENCE</div><h1>{pageTitle}</h1><p>Monitor availability, understand consumption and act on water-system alerts.</p></div><div className="last-updated"><span>LAST SYNC</span><b>{checkedAt ? checkedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Connecting…'}</b></div></div>
        {error && <div className="error-banner"><AlertTriangle size={18} /><span>{error}</span><button onClick={() => loadData(true)}>Retry</button></div>}
        <div className="demo-note"><CircleHelp size={15} /><span>Hackathon prototype: values are simulated, not live sensor readings. Leakage flags mean <b>possible unusual flow</b>, not confirmed leaks.</span></div>

        {page === 'Dashboard' && <>
          <section className="stats-grid">
            <StatCard icon={Droplets} label="WATER AVAILABLE" value={`${fmt(litres)} L`} sub={`${level.toFixed(1)}% of tank capacity`} tone="blue" />
            <StatCard icon={Waves} label="CURRENT FLOW" value={`${flow.toFixed(1)} L/min`} sub={status?.demand_level ? `${status.demand_level.toLowerCase()} activity period` : 'Waiting for readings'} tone="cyan" />
            <StatCard icon={Clock3} label="EST. REMAINING TIME" value={timeText(remainingMinutes)} sub="Simple estimate at current flow" tone="violet" />
            <StatCard icon={ShieldCheck} label="SYSTEM HEALTH" value={status?.system_health || 'CONNECTING'} sub={isWarning ? 'Review the alert panel' : 'No unusual pattern flagged'} tone={isWarning ? 'orange' : 'green'} />
          </section>

          <section className="dashboard-grid">
            <div className="panel tank-panel"><div className="panel-heading"><div><div className="eyebrow">LIVE MODEL</div><h2>Tank visualisation</h2></div><span className="status-chip"><span />{level <= settings.threshold ? 'LOW LEVEL' : 'NORMAL LEVEL'}</span></div>
              <div className="tank-layout"><TankVisual level={level} warning={level <= settings.threshold} /><div className="tank-details"><div className="level-number">{level.toFixed(1)}<small>%</small></div><p>Current tank level</p><div className="progress-track"><div className={`progress-fill ${level <= settings.threshold ? 'low' : ''}`} style={{ width: `${Math.min(100, Math.max(0, level))}%` }} /></div><div className="detail-line"><span>Available volume</span><b>{fmt(litres)} L</b></div><div className="detail-line"><span>Total capacity</span><b>{fmt(capacity)} L</b></div><div className="detail-line"><span>Refill threshold</span><b>{settings.threshold}%</b></div><div className={`tank-message ${level <= settings.threshold ? 'warn' : ''}`}><AlertTriangle size={16} /><span>{refillGuidance}</span></div></div></div>
              <div className="model-caption"><span className="model-pulse" /> Interactive-style 3D representation · Fill height follows simulated level</div>
            </div>
            <div className="panel one-touch-panel"><div className="panel-heading"><div><div className="eyebrow">SIGNATURE FEATURE</div><h2>One-touch status</h2></div><div className="bolt-icon"><Zap size={18} /></div></div><p className="panel-copy">Get the four most important water insights in one click.</p><button className="one-touch-button" onClick={checkStatus} disabled={refreshing}><span className="button-icon"><Zap size={21} /></span><span><b>CHECK WATER STATUS</b><small>Refresh readings & calculate status</small></span><ChevronRight size={20} /></button><div className="touch-summary"><div className="touch-row"><span className="touch-icon blue"><Droplets size={17} /></span><div><span>Current water level</span><b>{level.toFixed(1)}% · {fmt(litres)} L</b></div><CheckCircle2 size={16} className="row-check" /></div><div className="touch-row"><span className="touch-icon purple"><Clock3 size={17} /></span><div><span>Estimated time remaining</span><b>{timeText(remainingMinutes)}</b></div><CheckCircle2 size={16} className="row-check" /></div><div className="touch-row"><span className="touch-icon amber"><Bell size={17} /></span><div><span>Refill guidance</span><b>{level <= settings.threshold ? 'Refill recommended' : `Threshold at ${settings.threshold}%`}</b></div><span className={`mini-status ${level <= settings.threshold ? 'warning' : ''}`}>{level <= settings.threshold ? 'ACTION' : 'OK'}</span></div><div className="touch-row"><span className="touch-icon green"><ShieldCheck size={17} /></span><div><span>System health</span><b>{isWarning ? 'Unusual pattern flagged' : 'No unusual pattern flagged'}</b></div><span className={`mini-status ${isWarning ? 'warning' : ''}`}>{isWarning ? 'CHECK' : 'OK'}</span></div></div><div className="touch-foot"><CheckCircle2 size={14} /> {refreshing ? 'Refreshing simulated reading…' : 'Last checked ' + (checkedAt ? checkedAt.toLocaleTimeString() : 'not yet')}</div></div>
          </section>

          <section className="lower-grid"><div className="panel chart-panel"><div className="panel-heading"><div><div className="eyebrow">RECENT READINGS</div><h2>Water flow activity</h2></div><span className="chart-unit">L/min</span></div><div className="chart-area">{chartData.length > 1 ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="flowFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2085f5" stopOpacity={0.22} /><stop offset="100%" stopColor="#2085f5" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9eef5" /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8190a5' }} minTickGap={30} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8190a5' }} width={36} /><Tooltip /><Area type="monotone" dataKey="flow" name="Flow rate" stroke="#2085f5" strokeWidth={2.5} fill="url(#flowFill)" /></AreaChart></ResponsiveContainer> : <EmptyState text="Waiting for enough readings to draw the chart." />}</div></div><div className="panel alerts-preview"><div className="panel-heading"><div><div className="eyebrow">ATTENTION CENTRE</div><h2>Priority alerts</h2></div><button className="text-button" onClick={() => setPage('Alerts')}>View all <ChevronRight size={15} /></button></div><AlertList notifications={notifications} status={status} /></div></section>
        </>}

        {page === 'Analytics' && <><section className="stats-grid"><StatCard icon={Activity} label="TODAY'S USAGE" value={`${fmt(analytics?.usage?.today ?? status?.daily_usage)} L`} sub="Simulated daily total" tone="blue" /><StatCard icon={Activity} label="THIS WEEK'S USAGE" value={`${fmt(analytics?.usage?.weekly ?? ((analytics?.usage?.today ?? status?.daily_usage ?? 0) * 7))} L`} sub="Simulated weekly total" tone="cyan" /><StatCard icon={Activity} label="THIS MONTH'S USAGE" value={`${fmt(analytics?.usage?.monthly ?? ((analytics?.usage?.today ?? status?.daily_usage ?? 0) * 30))} L`} sub="Simulated monthly total" tone="violet" /><StatCard icon={Wallet} label="ESTIMATED COST" value={`₹${fmt(analytics?.cost?.estimated_monthly_cost ?? 0)}`} sub="Estimated monthly cost" tone="green" /></section><section className="panel full-chart"><div className="panel-heading"><div><div className="eyebrow">TREND ANALYSIS</div><h2>Recent flow-rate trend</h2></div><span className="chart-unit">Litres / minute</span></div><div className="chart-area tall">{chartData.length > 1 ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9eef5" /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8190a5' }} minTickGap={30} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8190a5' }} /><Tooltip /><Area type="monotone" dataKey="flow" name="Flow rate" stroke="#2085f5" fill="#d9ecff" strokeWidth={2.5} /></AreaChart></ResponsiveContainer> : <EmptyState text="Collecting readings for the trend chart." />}</div></section><section className="panel usage-panel"><div className="panel-heading"><div><div className="eyebrow">LEVEL HISTORY</div><h2>Tank level readings</h2></div></div><div className="chart-area medium">{chartData.length > 1 ? <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e9eef5" /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8190a5' }} minTickGap={30} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8190a5' }} /><Tooltip /><Bar dataKey="level" name="Tank level (%)" fill="#22a6b5" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyState text="Tank-level history will appear here." />}</div></section></>}

        {page === 'Zones' && <><div className="section-intro"><div><h2>Building water zones</h2><p>Zone readings are simulated for this prototype. Confirm real usage with installed meters before acting.</p></div><span className="neutral-pill">{zoneData.length || 4} ZONES CONFIGURED</span></div><section className="zone-grid">{(zoneData.length ? zoneData : [{ name: 'Zone A', type: 'Residential', flow_rate: 7, status: 'NORMAL' }, { name: 'Zone B', type: 'Residential', flow_rate: 5.5, status: 'NORMAL' }, { name: 'Zone C', type: 'Utility', flow_rate: 4, status: 'NORMAL' }, { name: 'Zone D', type: 'Garden', flow_rate: 3, status: 'NORMAL' }]).map((z, idx) => <div className="panel zone-card" key={z.name || idx}><div className="zone-top"><div className={`zone-icon z${idx}`}><Waves size={20} /></div><span className={`mini-status ${String(z.status).toLowerCase().includes('high') || String(z.status).toLowerCase().includes('warning') ? 'warning' : ''}`}>{z.status || 'NORMAL'}</span></div><div className="eyebrow">{z.type || 'BUILDING ZONE'}</div><h2>{z.name || `Zone ${String.fromCharCode(65 + idx)}`}</h2><div className="zone-flow">{Number(z.flow_rate || 0).toFixed(1)} <small>L/min</small></div><div className="zone-track"><div style={{ width: `${Math.min(100, Number(z.flow_rate || 0) / 30 * 100)}%` }} /></div><p>{String(z.status || 'NORMAL').toLowerCase().includes('high') ? 'Flow is above the configured baseline. Review this zone.' : 'No zone-level alert is currently flagged.'}</p></div>)}</section><div className="demo-note bottom-note"><CircleHelp size={15} /><span>Real zone-wise monitoring requires separate flow meters or validated sub-meter data per zone.</span></div></>}

        {page === 'Alerts' && <section className="panel alerts-page"><div className="panel-heading"><div><div className="eyebrow">SYSTEM EVENTS</div><h2>Alerts and recommended actions</h2></div><span className="neutral-pill">{notifications.length} backend events</span></div><AlertList notifications={notifications} status={status} expanded /><div className="alert-disclaimer"><ShieldCheck size={18} /><div><b>Interpret alerts carefully</b><p>NeerIQ uses rule-based pattern checks on simulated readings. A flagged event is a prompt to inspect, not proof of a physical leak.</p></div></div></section>}

        {page === 'AI Assistant' && (
          <section className="assistant-layout">
            <div className="panel assistant-panel">
              <div className="assistant-head">
                <div className="assistant-avatar"><Sparkles size={22} /></div>
                <div>
                  <h2>NeerIQ Assistant</h2>
                  <p>Grounded in the latest NeerIQ demo data</p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginLeft: 'auto' }}>
                  <select 
                    value={lang} 
                    onChange={e => setLang(e.target.value)} 
                    className="lang-select" 
                    style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  >
                    <option value="en-IN">English (en-IN)</option>
                    <option value="ta-IN">Tamil (ta-IN)</option>
                  </select>
                  {!isSupported && <span className="online-pill" style={{background: '#ef4444'}}><span style={{boxShadow: 'none', background: '#fff'}}/> NO MIC</span>}
                </div>
              </div>
              
              {micError && <div className="error-banner" style={{ margin: '10px 0', padding: '10px', fontSize: '13px' }}><AlertTriangle size={16} /><span>{micError}</span></div>}

              <div className="chat-messages">
                {chat.map((m, i) => <div className={`chat-message ${m.role}`} key={i}><div className="chat-bubble">{m.text}</div></div>)}
                {asking && <div className="chat-message assistant"><div className="chat-bubble typing">Checking NeerIQ data…</div></div>}
              </div>
              
              <div className="voice-controls-bar" style={{ display: 'flex', gap: '10px', padding: '10px 0', minHeight: '30px' }}>
                {isListening && <div className="voice-hint warning pulse" style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600' }}><Mic size={14}/> Listening...</div>}
                {isSpeaking && <div className="voice-hint success pulse" style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600' }}><VolumeX size={14}/> Speaking...</div>}
              </div>

              <form className="chat-form" onSubmit={sendQuestion}>
                <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ask about tank level, usage, refill…" />
                
                <button type="button" className={`mic-btn ${isListening ? 'active' : ''}`} onClick={() => isListening ? stopListening() : startListening()} title="Start Voice" style={{ background: 'transparent', border: 'none', color: isListening ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
                <button type="button" className="stop-btn" onClick={stopSpeaking} title="Stop Speaking" disabled={!isSpeaking} style={{ background: 'transparent', border: 'none', color: isSpeaking ? 'var(--accent-primary)' : 'var(--text-secondary)', padding: '0 10px' }}>
                  <VolumeX size={18} />
                </button>

                <button type="submit" disabled={asking || !question.trim()}><Send size={17} /></button>
              </form>
              <div className="suggested-questions"><span>Try asking</span>{['How much water is left?', 'When should we refill?', 'Is unusual flow detected?'].map(q => <button key={q} onClick={() => {setQuestion(q); askQuestion(q);}}>{q}</button>)}</div>
            </div>
            <div className="panel insight-side">
              <div className="eyebrow">CURRENT SYSTEM INSIGHT</div>
              <h2>{insight?.what?.message || 'Waiting for current readings'}</h2>
              <p>{insight?.why?.message || 'NeerIQ will explain the latest status when data is available.'}</p>
              <div className="recommendation"><div className="recommendation-icon"><Zap size={17} /></div><div><b>Recommended action</b><p>{insight?.action?.message || refillGuidance}</p></div></div>
              <div className="source-label">SOURCE · {insight?.source || 'NeerIQ local intelligence'}</div>
            </div>
          </section>
        )}

        {page === 'Settings' && <section className="settings-grid"><div className="panel settings-panel"><div className="panel-heading"><div><div className="eyebrow">CONFIGURATION</div><h2>Water system settings</h2></div></div><label className="setting-row"><span><b>Tank capacity</b><small>Used to calculate available litres</small></span><div className="setting-input"><input type="number" min="100" max="1000000" value={settings.capacity} onChange={e => setSettings(s => ({ ...s, capacity: Number(e.target.value) || 100 }))} /><span>L</span></div></label><label className="setting-row"><span><b>Refill threshold</b><small>Show refill guidance at this level</small></span><div className="setting-input"><input type="number" min="5" max="90" value={settings.threshold} onChange={e => setSettings(s => ({ ...s, threshold: Math.min(90, Math.max(5, Number(e.target.value) || 5)) }))} /><span>%</span></div></label><label className="setting-row"><span><b>Water tariff</b><small>Used for illustrative cost estimates</small></span><div className="setting-input"><span>₹</span><input type="number" min="0" value={settings.tariff} onChange={e => setSettings(s => ({ ...s, tariff: Math.max(0, Number(e.target.value) || 0) }))} /><span>/1000 L</span></div></label><label className="setting-row"><span><b>Dashboard refresh</b><small>Current demo feed refreshes every 5 seconds</small></span><div className="setting-input disabled"><span>5 seconds</span></div></label><button className="primary-button" onClick={() => { setOneTouch(false); loadData(true) }}><CheckCircle2 size={17} /> Apply display settings</button><p className="setting-hint">These settings update the prototype display. Tank capacity and tariff should also be saved to the backend for a production build.</p></div><div className="panel future-panel"><div className="future-icon"><ShieldCheck size={24} /></div><div className="eyebrow">FUTURE HARDWARE INTEGRATION</div><h2>Designed to connect to real sensors later</h2><p>The hackathon demo runs entirely on simulated data. A future deployment can replace the simulator with validated readings from a level sensor, flow meter and a connected controller.</p><ul><li>Tank level sensor</li><li>Per-line flow meter</li><li>STM32 controller + network module</li><li>Secure API data ingestion</li></ul><div className="neutral-pill">NO HARDWARE CONTROL IN THIS DEMO</div></div></section>}

        <footer className="page-footer"><span>© 2026 NeerIQ · Smart Water Management</span><span><span className="footer-dot" /> Prototype data · not connected to physical sensors</span></footer>
      </div>
    </main>
    {oneTouch && <div className="modal-backdrop" onClick={() => setOneTouch(false)}><section className="status-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setOneTouch(false)}>×</button><div className="modal-icon"><Zap size={24} /></div><div className="eyebrow">ONE-TOUCH REPORT</div><h2>Your water status, at a glance</h2><p className="modal-sub">Checked {checkedAt ? checkedAt.toLocaleTimeString() : 'just now'} · Simulated data</p><div className="modal-insights"><div><Droplets size={19} /><span>Current level</span><b>{level.toFixed(1)}% · {fmt(litres)} L</b></div><div><Clock3 size={19} /><span>Estimated remaining time</span><b>{timeText(remainingMinutes)}</b><small>Assumes current flow remains constant</small></div><div><Bell size={19} /><span>Refill guidance</span><b>{refillGuidance}</b><small>Configured threshold: {settings.threshold}%</small></div><div><ShieldCheck size={19} /><span>System health</span><b>{isWarning ? 'Attention required' : 'No unusual pattern flagged'}</b><small>Possible anomalies need physical verification</small></div></div><button className="primary-button full" onClick={() => { setOneTouch(false); setPage('Dashboard') }}>Back to dashboard <ChevronRight size={17} /></button></section></div>}
  </div>;
}

function StatCard({ icon: Icon, label, value, sub, tone }) { return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={19} /></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-sub">{sub}</div></div>; }

function TankVisual({ level = 0, warning = false }) {
  const safe = Math.max(0, Math.min(100, Number(level) || 0));
  const waterTop = 255 - safe * 2.0;
  return <div className="tank-visual-wrap"><svg className="tank-svg" viewBox="0 0 260 300" role="img" aria-label={`Illustrative tank filled to ${safe.toFixed(1)} percent`}>
    <defs><linearGradient id="tankGlass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#c9d8e8" stopOpacity=".48" /><stop offset=".45" stopColor="#fff" stopOpacity=".14" /><stop offset="1" stopColor="#91a9c0" stopOpacity=".35" /></linearGradient><linearGradient id="waterGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={warning ? '#f9b44b' : '#5ecbfa'} /><stop offset="1" stopColor={warning ? '#df8a25' : '#147be8'} /></linearGradient><clipPath id="tankClip"><path d="M52 52 Q52 37 68 37 H192 Q208 37 208 52 V246 Q208 263 190 263 H70 Q52 263 52 246 Z" /></clipPath></defs>
    <ellipse cx="130" cy="276" rx="91" ry="12" fill="#dfe9f3" /><path d="M65 44 V26 Q65 19 75 19 H185 Q195 19 195 26 V44" fill="none" stroke="#8ea3b8" strokeWidth="7" strokeLinecap="round" /><path d="M52 52 Q52 37 68 37 H192 Q208 37 208 52 V246 Q208 263 190 263 H70 Q52 263 52 246 Z" fill="url(#tankGlass)" stroke="#93a9be" strokeWidth="3" />
    <g clipPath="url(#tankClip)"><rect x="52" y={waterTop} width="156" height={Math.max(0, 263 - waterTop)} fill="url(#waterGradient)" opacity=".9" /><path d={`M52 ${waterTop} q19 -7 39 0 t39 0 t39 0 t39 0 v12 H52 Z`} fill={warning ? '#ffd18a' : '#b5f0ff'} opacity=".9" /><path d={`M70 ${waterTop + 23} q17 6 34 0 t34 0 t34 0`} stroke="#fff" strokeOpacity=".55" strokeWidth="2" fill="none" /></g>
    <path d="M52 83 H67 M52 123 H67 M52 163 H67 M52 203 H67 M193 83 H208 M193 123 H208 M193 163 H208 M193 203 H208" stroke="#7891a8" strokeWidth="2" opacity=".8" /><path d="M208 75 H225 V94 H237" fill="none" stroke="#9cb0c4" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /><path d="M208 220 H226 V236 H238" fill="none" stroke="#9cb0c4" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /><circle cx="239" cy="94" r="5" fill="#1d9cf0" /><circle cx="239" cy="236" r="5" fill="#1d9cf0" /><rect x="91" y="5" width="78" height="23" rx="11" fill="#edf5fc" stroke="#c5d5e4" /><text x="130" y="20" textAnchor="middle" fontSize="10" fill="#4b6680" fontWeight="700">NeerIQ TANK</text><text x="130" y="290" textAnchor="middle" fontSize="11" fill="#7b8fa5">{safe.toFixed(1)}% FILLED</text>
  </svg><div className="tank-badge"><span className={warning ? 'orange' : 'blue'} />{warning ? 'Refill soon' : 'Stable level'}</div></div>;
}

function AlertList({ notifications = [], status, expanded = false }) {
  const rows = notifications.slice(0, expanded ? 20 : 3);
  const fallback = [];
  if (status?.leakage_detected) fallback.push({ title: 'Possible unusual flow pattern', message: 'Review the meter and inspect the affected zone. This is not confirmed leakage.', priority: 1 });
  if (Number(status?.tank_level ?? 100) <= Number(status?.refill_threshold_percent ?? 30)) fallback.push({ title: 'Tank refill recommended', message: status?.refill_guidance, priority: 2 });
  const items = rows.length ? rows : fallback;
  if (!items.length) return <div className="empty-alerts"><div className="empty-check"><CheckCircle2 size={21} /></div><div><b>No priority alerts</b><p>No unusual pattern is currently flagged in the simulated readings.</p></div></div>;
  return <div className="alert-list">{items.map((n, i) => <div className="alert-item" key={i}><div className={`alert-mark ${Number(n.priority || 3) <= 1 ? 'critical' : ''}`}><AlertTriangle size={17} /></div><div className="alert-text"><b>{n.title || n.type || n.message || 'Water system event'}</b><p>{n.message || n.description || 'Review this event in the context of current building activity.'}</p>{expanded && <small>Rule-based demo event · verify before taking action</small>}</div><span className={`priority ${Number(n.priority || 3) <= 1 ? 'high' : ''}`}>{Number(n.priority || 3) <= 1 ? 'HIGH' : 'NOTICE'}</span></div>)}</div>;
}
function EmptyState({ text }) { return <div className="empty-state"><Activity size={22} /><span>{text}</span></div>; }
export default App;
