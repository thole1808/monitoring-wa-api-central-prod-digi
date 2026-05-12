"use client";

import { useState, useRef, useEffect } from 'react';
import {
    Server, 
    CheckCircle, 
    XCircle, 
    AlertTriangle,
    Phone,
    Play,
    TerminalSquare,
    Radio,
    Trash2,
    Square,
    RefreshCw,
    Hammer,
    Settings2,
    Activity,
    Search,
    ShieldCheck,
    Cpu,
    Globe,
    ShieldAlert,
    CheckCircle2,
    Sun,
    Moon,
    Zap,
    Loader2
} from 'lucide-react';

const SERVICES = [
    { port: 8001, name: 'wa-api-bkk' },
    { port: 8002, name: 'wa-api-bapas' },
    { port: 8004, name: 'wa-api-smartdesaku' },
    { port: 8005, name: 'wa-api-gianyar' },
    { port: 8007, name: 'wa-api-bangli' },
    { port: 8009, name: 'wa-api-boyolali' },
    { port: 8010, name: 'wa-api-purwodadi' }
];

const WA_LINK_REGEX = /https:\/\/wa\.me\/[^\s]+/i;

export default function Home() {
    const [targetNumber, setTargetNumber] = useState('0895370034003');
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const lastPortRef = useRef(null);
    const [consoleMsg, setConsoleMsg] = useState('SYSTEM_READY // WAITING_FOR_INPUT');
    const [stats, setStats] = useState({ success: 0, failed: 0, delay: 0 });
    const [errorLogs, setErrorLogs] = useState([]);
    const [errorStreamStatus, setErrorStreamStatus] = useState('CONNECTING');
    const [controlLogs, setControlLogs] = useState({});
    const [isControlling, setIsControlling] = useState({});
    const [logSearch, setLogSearch] = useState('');
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [theme, setTheme] = useState('dark');
    const logsPerPage = 10;

    const [serviceState, setServiceState] = useState(
        SERVICES.reduce((acc, s) => {
            acc[s.port] = { status: 'IDLE', message: '-', time: '-', log: 'READY', connectionStatus: 'IDLE', logs: [], currentOp: null, opFinished: false };
            return acc;
        }, {})
    );

    const filteredLogs = errorLogs.filter(log => 
        log.name?.toLowerCase().includes(logSearch.toLowerCase()) || 
        log.line?.toLowerCase().includes(logSearch.toLowerCase()) ||
        log.port?.toString().includes(logSearch)
    );

    const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
    const paginatedLogs = filteredLogs.slice((currentPage - 1) * logsPerPage, currentPage * logsPerPage);

    useEffect(() => { setCurrentPage(1); }, [logSearch]);

    const maskSensitives = (text) => {
        if (!text) return text;
        return text.replace(/\b(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.***.***')
                   .replace(/:(\d{4,5})\b/g, ':****');
    };

    const getEmitCode = (line) => {
        if (!line) return null;
        if (line.match(WA_LINK_REGEX)) return 'QR-LINK';
        const emitMatch = line.match(/emitcode["\s:]+([^"\s,}\]]+)/i);
        return emitMatch ? emitMatch[1].replace(/["']/g, '') : null;
    };

    const handleReconnectLogs = () => {
        setIsReconnecting(true);
        setErrorLogs([]);
        setTimeout(() => setIsReconnecting(false), 800);
    };

    useEffect(() => {
        const source = new EventSource('/api/logs/errors');
        source.addEventListener('error_log', (e) => {
            setErrorLogs(prev => [JSON.parse(e.data), ...prev].slice(0, 100));
            setErrorStreamStatus('CONNECTED');
        });
        source.addEventListener('error', () => setErrorStreamStatus('DISCONNECTED'));
        return () => source.close();
    }, []);

    const startMonitoring = async (e, port = null) => {
        if (e) e.preventDefault();
        setIsMonitoring(true);
        setIsConnected(false);
        lastPortRef.current = port;
        if (!port) setStats({ success: 0, failed: 0, delay: 0 });
        
        const updateState = port ? { [port]: { ...serviceState[port], connectionStatus: 'CONNECTING' } } 
                                 : SERVICES.reduce((acc, s) => ({ ...acc, [s.port]: { ...serviceState[s.port], connectionStatus: 'CONNECTING' } }), {});
        setServiceState(prev => ({ ...prev, ...updateState }));

        try {
            const response = await fetch('/api/monitor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetNumber, servicePort: port })
            });
            setIsConnected(true);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                let lines = buffer.split('\n\n');
                buffer = lines.pop();
                lines.forEach(chunk => {
                    const event = chunk.match(/event: (.*)\n/);
                    const data = chunk.match(/data: (.*)/);
                    if (event && data) handleEvent(event[1], JSON.parse(data[1]));
                });
            }
        } catch (err) {
            setIsMonitoring(false);
            setConsoleMsg(`ERROR: ${err.message}`);
        }
    };

    const runControlAction = async (serviceName, port, action) => {
        const key = `${serviceName}-${action}`;
        setIsControlling(prev => ({ ...prev, [key]: true }));
        setControlLogs(prev => ({ ...prev, [key]: [`>> [${new Date().toLocaleTimeString()}] INITIATING_${action.toUpperCase()}...`] }));

        try {
            const response = await fetch('/api/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, serviceName, port })
            });
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const lines = decoder.decode(value, { stream: true }).split('\n\n');
                lines.forEach(line => {
                    const data = line.match(/data: (.*)/);
                    if (data) {
                        const parsed = JSON.parse(data[1]);
                        setControlLogs(prev => ({ ...prev, [key]: [...(prev[key] || []), `> ${parsed.message}`] }));
                    }
                });
            }
        } catch (err) {
            setControlLogs(prev => ({ ...prev, [key]: [...(prev[key] || []), `!! ERROR: ${err.message}`] }));
        } finally {
            setIsControlling(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleQuickCleanup = async (serviceName, port) => {
        const updateOp = (op, finished = false) => setServiceState(prev => ({ 
            ...prev, [port]: { ...prev[port], currentOp: op, opFinished: finished } 
        }));

        try {
            updateOp('STOPPING...');
            await runControlAction(serviceName, port, 'stop');
            
            updateOp('REMOVING...');
            await runControlAction(serviceName, port, 'rm');
            
            updateOp('RESETTING_DB...');
            await runControlAction(serviceName, port, 'reset_db');
            
            updateOp('CLEANUP_DONE', true);
            setTimeout(() => updateOp(null, false), 3000);
        } catch (err) {
            updateOp('ERROR');
            setTimeout(() => updateOp(null, false), 3000);
        }
    };

    const handleEvent = (event, data) => {
        if (event === 'status') setConsoleMsg(`LOG: ${data.message.toUpperCase()}`);
        else if (event === 'service_start') {
            setServiceState(prev => ({
                ...prev,
                [data.port]: { ...prev[data.port], status: 'RUNNING', message: 'SENDING...', time: data.time, log: 'PROCESS_START', connectionStatus: 'CONNECTED', logs: [...(prev[data.port].logs || []), `[${data.time}] RUNNING`] }
            }));
        } else if (event === 'service_result') {
            setServiceState(prev => ({
                ...prev,
                [data.port]: { ...prev[data.port], status: data.status, message: data.message, time: data.time || '-', log: data.detail || '-', connectionStatus: 'CONNECTED', logs: [...(prev[data.port].logs || []), `[${data.time}] ${data.status}`] }
            }));
            if (data.status === 'SUCCESS') setStats(s => ({ ...s, success: s.success + 1 }));
            else if (data.status === 'FAILED') setStats(s => ({ ...s, failed: s.failed + 1 }));
        } else if (event === 'done') setIsMonitoring(false);
    };

    const getConnectionStatusBadge = (connStatus) => {
        switch (connStatus) {
            case 'CONNECTED': return { badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: '🟢', label: 'CONNECTED' };
            case 'DISCONNECTED': return { badge: 'bg-rose-500/10 text-rose-600 border-rose-500/20', icon: '🔴', label: 'DISCONNECTED' };
            case 'CONNECTING': return { badge: 'bg-blue-500/10 text-blue-600 border-blue-500/20', icon: '🟡', label: 'CONNECTING' };
            default: return { badge: 'bg-slate-100 text-slate-500 border-slate-200', icon: '⚪', label: 'IDLE' };
        }
    };

    return (
        <div className={`min-h-screen font-sans relative overflow-x-hidden p-4 sm:p-8 transition-colors duration-500 ${theme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-[#0b0e14] text-slate-100'}`}>
            <div className={`fixed inset-0 z-0 pointer-events-none transition-opacity duration-1000 ${theme === 'light' ? 'bg-gradient-to-br from-slate-50 via-white to-blue-50 opacity-100' : 'bg-gradient-to-br from-[#0d1117] via-[#0b0e14] to-[#010409] opacity-100'}`}></div>
            
            <div className="relative z-10 max-w-[1600px] mx-auto space-y-8">
                {/* Header */}
                <header className={`flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 backdrop-blur-md border p-8 rounded-3xl shadow-xl transition-all ${theme === 'light' ? 'bg-white/80 border-slate-200 shadow-slate-200/50' : 'bg-slate-900/40 border-white/5 shadow-black/50'}`}>
                    <div className="flex items-center gap-5">
                        <div className={`p-4 rounded-2xl border transition-all ${theme === 'light' ? 'bg-blue-50 border-blue-100 text-blue-600' : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}`}>
                            <ShieldCheck className="w-8 h-8 animate-pulse" />
                        </div>
                        <div>
                            <h1 className={`text-2xl font-black uppercase tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>
                                Central Monitoring Node <span className="text-blue-500 italic">// DIGI-PROD</span>
                            </h1>
                            <div className="flex items-center gap-4 mt-1">
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500"><Globe className="w-3 h-3" /> Production_Active</span>
                                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-500"><Cpu className="w-3 h-3" /> v3.2.4 Enterprise</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto">
                        <div className="relative flex-1 sm:flex-none">
                            <input 
                                type="text" 
                                value={targetNumber}
                                onChange={(e) => setTargetNumber(e.target.value)}
                                className={`w-full sm:w-64 border rounded-2xl px-5 py-3 text-sm outline-none transition-all ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500 focus:bg-white' : 'bg-black/40 border-slate-700 text-white focus:border-blue-500'}`}
                                placeholder="TARGET_NUMBER"
                            />
                        </div>
                        <button 
                            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                            className={`p-3 rounded-2xl border transition-all ${theme === 'light' ? 'bg-white border-slate-200 text-slate-400 hover:text-blue-500 shadow-sm' : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'}`}
                        >
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                    </div>
                </header>

                {/* Main Grid */}
                <div className="flex flex-col gap-8">
                    {/* Node Maintenance */}
                    <section className={`border rounded-3xl p-8 shadow-2xl transition-all ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-[#161b22] border-white/5'}`}>
                        <div className="flex items-center gap-4 mb-10">
                            <Settings2 className={`w-6 h-6 ${theme === 'light' ? 'text-blue-600' : 'text-blue-400'}`} />
                            <h3 className={`text-sm font-black uppercase tracking-[0.4em] ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`}>Service Maintenance Node</h3>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                            {SERVICES.map(service => {
                                const s = serviceState[service.port];
                                const isOpRunning = !!s.currentOp && !s.opFinished;
                                const isOpSuccess = s.opFinished;

                                return (
                                    <div key={service.port} className={`border rounded-3xl p-8 space-y-8 transition-all hover:translate-y-[-6px] ${theme === 'light' ? 'bg-slate-50 border-slate-200 hover:bg-white shadow-md' : 'bg-black/40 border-white/5 hover:border-blue-500/30 shadow-xl'}`}>
                                        <div className="flex justify-between items-center border-b border-slate-200/10 pb-6">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-2.5 h-2.5 rounded-full ${s.connectionStatus === 'CONNECTED' ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`}></div>
                                                <span className={`font-black text-sm uppercase tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{service.name}</span>
                                            </div>
                                            <span className={`text-[9px] px-3 py-1 rounded-full font-black ${theme === 'light' ? 'bg-white text-slate-500 border border-slate-200' : 'bg-white/5 text-slate-500'}`}>PORT_{service.port}</span>
                                        </div>

                                        <div className="space-y-8">
                                            {/* STEP 1: CLEANUP (COMPACT) */}
                                            <div className="relative pl-10">
                                                <div className={`absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black border ${theme === 'light' ? 'bg-white text-blue-600 border-blue-100 shadow-sm' : 'bg-slate-800 text-blue-400 border-slate-700'}`}>01</div>
                                                <div className="mb-4">
                                                    <h4 className={`text-[10px] font-black uppercase tracking-widest ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`}>CLEANUP PROJECT</h4>
                                                    <p className="text-[8px] text-slate-500 font-bold uppercase">STOP, REMOVE & RESET DATABASE</p>
                                                </div>
                                                <button 
                                                    onClick={() => handleQuickCleanup(service.name, service.port)}
                                                    disabled={isOpRunning}
                                                    className={`w-full py-3.5 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-sm active:scale-[0.98]
                                                        ${isOpRunning ? 'bg-amber-500/20 border-amber-500/50 text-amber-500 cursor-wait' : 
                                                          isOpSuccess ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-600' : 
                                                          theme === 'light' ? 'bg-slate-900 text-white hover:bg-blue-600 border-transparent' : 'bg-white/5 border-white/5 text-slate-300 hover:bg-blue-600 hover:text-white'}
                                                    `}
                                                >
                                                    {isOpRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : isOpSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Zap className="w-4 h-4 fill-current" />}
                                                    {s.currentOp || 'EXECUTE_CLEANUP'}
                                                </button>
                                            </div>

                                            {/* STEP 2: UPGRADE */}
                                            <div className="relative pl-10">
                                                <div className={`absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black border ${theme === 'light' ? 'bg-white text-blue-600 border-blue-100 shadow-sm' : 'bg-slate-800 text-blue-400 border-slate-700'}`}>02</div>
                                                <div className="mb-4">
                                                    <h4 className={`text-[10px] font-black uppercase tracking-widest ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`}>UPGRADE KERNEL</h4>
                                                    <p className="text-[8px] text-slate-500 font-bold uppercase">BUILD IMAGE ALPHA-VERSION</p>
                                                </div>
                                                <button 
                                                    onClick={() => runControlAction(service.name, service.port, 'build')}
                                                    disabled={isControlling[`${service.name}-build`]}
                                                    className={`w-full py-3 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${theme === 'light' ? 'bg-white border-slate-200 text-slate-600 hover:bg-emerald-500/10 hover:text-emerald-600' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-400'}`}
                                                >
                                                    {isControlling[`${service.name}-build`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Hammer className="w-3.5 h-3.5" />}
                                                    BUILD_ALPHA
                                                </button>
                                            </div>

                                            {/* STEP 3: DEPLOY */}
                                            <div className="relative pl-10">
                                                <div className={`absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black border ${theme === 'light' ? 'bg-white text-blue-600 border-blue-100 shadow-sm' : 'bg-slate-800 text-blue-400 border-slate-700'}`}>03</div>
                                                <div className="mb-4">
                                                    <h4 className={`text-[10px] font-black uppercase tracking-widest ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`}>DEPLOY NODE</h4>
                                                    <p className="text-[8px] text-slate-500 font-bold uppercase">RUN CONTAINER & MONITOR</p>
                                                </div>
                                                <div className="flex flex-col gap-3">
                                                    <button onClick={() => startMonitoring(null, service.port)} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2">
                                                        <Play className="w-3.5 h-3.5 fill-current" /> RUN_NODE
                                                    </button>
                                                    <button onClick={() => runControlAction(service.name, service.port, 'get_logs')} className={`w-full py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${theme === 'light' ? 'bg-white border-slate-200 text-slate-400 hover:text-slate-900' : 'bg-white/5 border-white/5 text-slate-500 hover:text-white'}`}>
                                                        <TerminalSquare className="w-3.5 h-3.5" /> GET_LOGS
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Terminal Output */}
                                        <div className={`rounded-2xl p-5 font-mono text-[9px] max-h-48 overflow-y-auto border shadow-inner ${theme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-black/60 border-white/5 text-slate-500'}`}>
                                            {Object.entries(controlLogs).filter(([k]) => k.startsWith(service.name)).length > 0 ? (
                                                Object.entries(controlLogs).filter(([k]) => k.startsWith(service.name)).map(([k, logs]) => (
                                                    <div key={k} className="mb-5 last:mb-0">
                                                        <div className="text-blue-500 font-black mb-2 flex items-center gap-2 uppercase tracking-widest text-[8px]">
                                                            {k.split('-').pop()} {isControlling[k] && <RefreshCw className="w-2.5 h-2.5 animate-spin" />}
                                                        </div>
                                                        {logs.slice(-5).map((l, i) => {
                                                            const waMatch = l.match(WA_LINK_REGEX);
                                                            return (
                                                                <div key={i} className="mb-1 opacity-80 break-all leading-relaxed">
                                                                    {maskSensitives(l)}
                                                                    {waMatch && (
                                                                        <div className="mt-4 bg-white p-5 rounded-3xl border-4 border-blue-500 inline-block shadow-2xl scale-95 origin-left">
                                                                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(waMatch[0])}`} className="w-48 h-48" />
                                                                            <p className="text-black font-black text-center mt-3 text-[11px] tracking-widest uppercase">SCAN_AUTH_QR</p>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="text-center py-10 opacity-30 italic font-black text-[10px] tracking-[0.3em]">LISTENING_IDLE</div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Telemetry Summary Cards */}
                    <section className="space-y-6">
                        <div className="flex items-center gap-4 px-2">
                            <Radio className={`w-5 h-5 animate-pulse ${theme === 'light' ? 'text-blue-600' : 'text-blue-500'}`} />
                            <h3 className={`text-xs font-black uppercase tracking-[0.5em] ${theme === 'light' ? 'text-slate-800' : 'text-slate-100'}`}>System_Telemetry_Snapshot</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                            {SERVICES.map(service => {
                                const s = serviceState[service.port] || { status: 'IDLE', message: '-', time: '-', log: '' };
                                const statusInfo = getConnectionStatusBadge(s.connectionStatus);
                                return (
                                    <div key={service.port} className={`border rounded-3xl p-6 transition-all shadow-xl ${theme === 'light' ? 'bg-white border-slate-200 shadow-slate-200/60' : 'bg-[#161b22] border-white/5'}`}>
                                        <div className="flex justify-between items-start mb-5">
                                            <div>
                                                <p className={`text-[10px] font-black uppercase truncate ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{service.name}</p>
                                                <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest mt-1">PORT: {service.port}</p>
                                            </div>
                                            <div className={`px-3 py-1 rounded-full text-[8px] font-black border uppercase flex items-center gap-2 ${statusInfo.badge}`}>
                                                <span>{statusInfo.icon}</span> {statusInfo.label}
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-4">
                                            <div className={`flex justify-between items-center text-[9px] border-b pb-2 ${theme === 'light' ? 'border-slate-100' : 'border-slate-200/10'}`}>
                                                <span className="text-slate-500 font-bold uppercase">STATUS</span>
                                                <span className={`font-black ${s.status === 'SUCCESS' ? 'text-emerald-500' : s.status === 'FAILED' ? 'text-rose-500' : 'text-blue-500'}`}>{s.status}</span>
                                            </div>
                                            <div className={`flex justify-between items-center text-[9px] border-b pb-2 ${theme === 'light' ? 'border-slate-100' : 'border-slate-200/10'}`}>
                                                <span className="text-slate-500 font-bold uppercase">LAST_SYNC</span>
                                                <span className={`font-mono ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>{s.time}</span>
                                            </div>
                                            <div className={`p-3 rounded-2xl text-[9px] font-mono h-20 overflow-y-auto leading-relaxed custom-scrollbar ${theme === 'light' ? 'bg-slate-50 text-slate-500 border border-slate-100' : 'bg-black/40 text-slate-500 border border-white/5'}`}>
                                                {maskSensitives(s.log)}
                                            </div>
                                            <button 
                                                onClick={() => startMonitoring(null, service.port)}
                                                disabled={isMonitoring}
                                                className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${theme === 'light' ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-blue-500 shadow-sm' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'}`}
                                            >
                                                Manual_Verify
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
