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
    Moon
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
    const [isAutoMonitoring, setIsAutoMonitoring] = useState(false);
    const logsPerPage = 5;

    const [serviceState, setServiceState] = useState(
        SERVICES.reduce((acc, s) => {
            acc[s.port] = { status: 'IDLE', message: '-', time: '-', log: 'READY', connectionStatus: 'IDLE', logs: [] };
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

    const handleEvent = (event, data) => {
        if (event === 'status') setConsoleMsg(`LOG: ${data.message.toUpperCase()}`);
        else if (event === 'service_start') {
            setServiceState(prev => ({
                ...prev,
                [data.port]: { status: 'RUNNING', message: 'SENDING...', time: data.time, log: 'PROCESS_START', connectionStatus: 'CONNECTED', logs: [...(prev[data.port].logs || []), `[${data.time}] RUNNING`] }
            }));
        } else if (event === 'service_result') {
            setServiceState(prev => ({
                ...prev,
                [data.port]: { status: data.status, message: data.message, time: data.time || '-', log: data.detail || '-', connectionStatus: 'CONNECTED', logs: [...(prev[data.port].logs || []), `[${data.time}] ${data.status}`] }
            }));
            if (data.status === 'SUCCESS') setStats(s => ({ ...s, success: s.success + 1 }));
            else if (data.status === 'FAILED') setStats(s => ({ ...s, failed: s.failed + 1 }));
        } else if (event === 'done') setIsMonitoring(false);
    };

    const getConnectionStatusBadge = (connStatus) => {
        switch (connStatus) {
            case 'CONNECTED': return { badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: '🟢', label: 'CONNECTED' };
            case 'DISCONNECTED': return { badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30', icon: '🔴', label: 'DISCONNECTED' };
            case 'CONNECTING': return { badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', icon: '🟡', label: 'CONNECTING' };
            case 'ERROR': return { badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30', icon: '❌', label: 'ERROR' };
            default: return { badge: 'bg-slate-500/20 text-slate-300 border-slate-500/30', icon: '⚪', label: 'IDLE' };
        }
    };

    return (
        <div className={`min-h-screen font-mono relative overflow-x-hidden p-4 sm:p-8 selection:bg-cyan-500/30 transition-colors duration-500 ${theme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-[#05070a] text-slate-100'}`}>
            {/* Cyberpunk Grid Background */}
            <div className={`fixed inset-0 z-0 opacity-20 pointer-events-none ${theme === 'light' ? 'bg-[radial-gradient(#cbd5e1_0.5px,transparent_0.5px)]' : 'bg-[radial-gradient(#1e293b_0.5px,transparent_0.5px)]'}`} style={{ backgroundSize: '24px 24px' }}></div>
            
            <div className="relative z-10 max-w-[1600px] mx-auto space-y-8">
                {/* HUD Header */}
                <header className={`flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 backdrop-blur-md border p-8 rounded-3xl shadow-2xl relative overflow-hidden group ${theme === 'light' ? 'bg-white/80 border-slate-200' : 'bg-slate-900/40 border-white/5'}`}>
                    <div className="absolute top-0 left-0 w-1 h-full bg-cyan-500"></div>
                    <div className="space-y-2">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="w-8 h-8 text-cyan-500 animate-pulse" />
                            <h1 className={`text-3xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-white via-cyan-400 to-blue-500 bg-clip-text text-transparent`}>
                                Central Monitoring Node // Digi-Prod
                            </h1>
                        </div>
                        <div className={`flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
                            <span className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> Production_Active</span>
                            <span className="flex items-center gap-1.5"><Cpu className="w-3 h-3" /> Kernel_v3.2.0</span>
                            <span className="text-cyan-500/50">Status: Operational</span>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 w-full xl:w-auto">
                        <div className="relative flex-1 sm:flex-none">
                            <input 
                                type="text" 
                                value={targetNumber}
                                onChange={(e) => setTargetNumber(e.target.value)}
                                className={`w-full sm:w-64 border rounded-xl px-4 py-3 text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 outline-none transition-all ${theme === 'light' ? 'bg-slate-100 border-slate-200 text-slate-900' : 'bg-black/60 border-slate-700 text-white'}`}
                                placeholder="TARGET_NUMBER"
                            />
                        </div>
                        <button 
                            onClick={() => startMonitoring()}
                            disabled={isMonitoring}
                            className={`px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-30 flex items-center gap-3 shadow-lg ${theme === 'light' ? 'bg-slate-900 text-white hover:bg-cyan-600' : 'bg-cyan-500 text-black shadow-cyan-500/20 hover:bg-cyan-400'}`}
                        >
                            {isMonitoring ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                            EXECUTE_SCAN
                        </button>
                    </div>
                </header>

                {/* Telemetry Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                        { label: 'NODES_ONLINE', value: SERVICES.length, icon: Cpu, color: 'text-cyan-400', glow: 'glow-blue' },
                        { label: 'THREAT_SCAN', value: isMonitoring ? 'ACTIVE' : 'IDLE', icon: ShieldAlert, color: isMonitoring ? 'text-rose-400' : 'text-slate-500', glow: isMonitoring ? 'glow-rose' : '' },
                        { label: 'SUCCESS_OPS', value: stats.success, icon: CheckCircle2, color: 'text-emerald-400', glow: 'glow-emerald' },
                        { label: 'FAILED_REPORTS', value: stats.failed, icon: AlertTriangle, color: 'text-rose-400', glow: stats.failed > 0 ? 'glow-rose' : '' }
                    ].map((stat, i) => (
                        <div key={i} className={`backdrop-blur-md border rounded-3xl p-6 transition-all hover:scale-[1.02] ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-white/5 shadow-xl'} ${stat.glow}`}>
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-2xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/5'} ${stat.color}`}>
                                    <stat.icon className="w-5 h-5" />
                                </div>
                                <span className={`text-[9px] font-black uppercase tracking-widest ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>{stat.label}</span>
                            </div>
                            <div className={`text-3xl font-black tracking-tighter ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{stat.value}</div>
                        </div>
                    ))}
                </div>

                <div className={`border rounded-2xl p-4 flex items-center gap-4 text-xs overflow-hidden ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-black/60 border-cyan-900/30'}`}>
                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-ping flex-shrink-0"></div>
                    <span className={`tracking-widest uppercase font-black truncate ${theme === 'light' ? 'text-slate-600' : 'text-cyan-500/80'}`}>{consoleMsg}</span>
                </div>

                {/* Main Content Sections */}
                <div className="flex flex-col gap-8">
                    {/* Log Stream Section */}
                    <section className={`backdrop-blur-md border rounded-3xl overflow-hidden shadow-2xl ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-white/5'}`}>
                        <div className={`px-8 py-6 border-b flex flex-col lg:flex-row justify-between items-center gap-6 ${theme === 'light' ? 'border-slate-100' : 'border-white/5'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${theme === 'light' ? 'bg-rose-50 border-rose-100' : 'bg-rose-500/10 border-rose-500/20'}`}>
                                    <Radio className="w-5 h-5 text-rose-500 animate-pulse" />
                                </div>
                                <div>
                                    <h3 className={`text-xs font-black uppercase tracking-[0.3em] ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`}>Anomaly_Stream</h3>
                                    <p className="text-[10px] text-slate-500 font-bold">REALTIME_FILTER: ERR_LOGS</p>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                                <div className="relative w-full sm:w-64">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                                    <input 
                                        type="text" 
                                        placeholder="SEARCH_LOGS..."
                                        value={logSearch}
                                        onChange={(e) => setLogSearch(e.target.value)}
                                        className={`border rounded-xl pl-10 pr-4 py-2.5 text-xs focus:border-cyan-500 outline-none w-full ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-black/40 border-slate-800 text-slate-300'}`}
                                    />
                                </div>
                                <button onClick={handleReconnectLogs} className={`p-2.5 rounded-xl border transition-colors w-full sm:w-auto flex justify-center ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-400 hover:text-cyan-500' : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-cyan-400'}`}>
                                    <RefreshCw className={`w-4 h-4 ${isReconnecting ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left min-w-[800px]">
                                <thead>
                                    <tr className={`text-[9px] uppercase font-black tracking-widest border-b ${theme === 'light' ? 'bg-slate-50 text-slate-400 border-slate-100' : 'bg-black/20 text-slate-600 border-white/5'}`}>
                                        <th className="px-8 py-4">TIMESTAMP</th>
                                        <th className="px-8 py-4 text-center">NODE</th>
                                        <th className="px-8 py-4 text-center">PORT</th>
                                        <th className="px-8 py-4">PAYLOAD_DATA</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y font-mono text-[10px] ${theme === 'light' ? 'divide-slate-100' : 'divide-white/5'}`}>
                                    {paginatedLogs.length === 0 ? (
                                        <tr><td colSpan="4" className="px-8 py-10 text-center text-slate-400 italic tracking-[0.2em]">NO_ANOMALIES_DETECTED</td></tr>
                                    ) : (
                                        paginatedLogs.map((log, index) => {
                                            const emit = getEmitCode(log.line);
                                            const waLinkMatch = log.line.match(WA_LINK_REGEX);
                                            return (
                                                <tr key={index} className={`transition-colors group ${theme === 'light' ? 'hover:bg-slate-50' : 'hover:bg-white/[0.02]'}`}>
                                                    <td className="px-8 py-3 text-slate-400 whitespace-nowrap">{log.time}</td>
                                                    <td className="px-8 py-3 text-center"><span className="px-3 py-1 rounded font-black border uppercase text-[8px] bg-rose-500/10 text-rose-400 border-rose-500/20">{log.name}</span></td>
                                                    <td className="px-8 py-3 text-center text-slate-500">{log.port}</td>
                                                    <td className="px-8 py-3">
                                                        <div className="flex flex-col gap-2">
                                                            <div className={`leading-relaxed transition-colors break-all ${theme === 'light' ? 'text-slate-600 group-hover:text-slate-900' : 'text-slate-400 group-hover:text-slate-200'}`}>{maskSensitives(log.line)}</div>
                                                            {emit && (
                                                                <div className="flex items-center gap-3">
                                                                    <span className="px-2.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[8px] font-black tracking-[0.2em] uppercase">EVENT_ID: {emit}</span>
                                                                    {emit === 'QR-LINK' && waLinkMatch && (
                                                                        <div className="relative group/qr">
                                                                            <div className="bg-white p-1 rounded-lg border-2 border-cyan-500 cursor-pointer">
                                                                                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(waLinkMatch[0])}`} className="w-8 h-8" />
                                                                            </div>
                                                                            <div className="absolute bottom-full left-0 hidden group-hover/qr:block z-50 bg-white p-6 rounded-3xl border-4 border-cyan-500 shadow-2xl mb-4">
                                                                                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(waLinkMatch[0])}`} className="w-64 h-64" />
                                                                                <p className="text-[10px] text-black font-black text-center mt-4 tracking-[0.3em] uppercase">SCAN_AUTH_LINK</p>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div className={`px-8 py-6 border-t flex flex-col sm:flex-row justify-between items-center gap-6 ${theme === 'light' ? 'bg-slate-50 border-slate-100' : 'bg-black/40 border-white/5'}`}>
                                <div className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em]">
                                    SEGMENT: {currentPage} / {totalPages} // TOTAL_LOGS: {filteredLogs.length}
                                </div>
                                <div className="flex items-center gap-3 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className={`px-4 py-2 rounded-xl text-[9px] font-black tracking-widest uppercase flex-shrink-0 transition-all ${theme === 'light' ? 'bg-white border border-slate-200 text-slate-400 hover:text-slate-900' : 'bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20'}`}
                                    >
                                        PREV_BUFF
                                    </button>
                                    <div className="flex gap-2">
                                        {[...Array(Math.min(5, totalPages))].map((_, i) => (
                                            <button key={i+1} onClick={() => setCurrentPage(i+1)} className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all flex-shrink-0 ${currentPage === i+1 ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30' : theme === 'light' ? 'bg-white border border-slate-200 text-slate-400' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>{i+1}</button>
                                        ))}
                                    </div>
                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className={`px-4 py-2 rounded-xl text-[9px] font-black tracking-widest uppercase flex-shrink-0 transition-all ${theme === 'light' ? 'bg-white border border-slate-200 text-slate-400 hover:text-slate-900' : 'bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20'}`}
                                    >
                                        NEXT_BUFF
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Node Control Section */}
                    <section className={`backdrop-blur-md border rounded-3xl p-4 sm:p-8 shadow-2xl ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-white/5'}`}>
                        <div className="flex items-center gap-4 mb-8">
                            <Settings2 className="w-6 h-6 text-amber-400" />
                            <h3 className={`text-xs font-black uppercase tracking-[0.4em] ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`}>Node_Maintenance</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {SERVICES.map(service => (
                                <div key={service.port} className={`border rounded-2xl p-6 space-y-6 transition-all group ${theme === 'light' ? 'bg-slate-50 border-slate-100' : 'bg-black/40 border-white/5 hover:border-cyan-500/30'}`}>
                                    <div className={`flex justify-between items-center border-b pb-4 ${theme === 'light' ? 'border-slate-200' : 'border-white/5'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse"></div>
                                            <span className={`font-black text-xs uppercase tracking-tighter ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{service.name}</span>
                                        </div>
                                        <span className={`text-[8px] px-2 py-1 rounded font-bold uppercase tracking-widest ${theme === 'light' ? 'bg-white text-slate-400 border border-slate-200' : 'bg-white/5 text-slate-500'}`}>PORT_{service.port}</span>
                                    </div>

                                    <div className="space-y-6">
                                        {[
                                            { step: 1, title: 'SYSTEM_CLEANUP', desc: 'STOP_AND_REMOVE_DATABASE', actions: [
                                                { id: 'stop', icon: Square, color: 'hover:bg-amber-500/20 hover:text-amber-400' },
                                                { id: 'rm', icon: Trash2, color: 'hover:bg-rose-500/20 hover:text-rose-400' },
                                                { id: 'reset_db', icon: RefreshCw, color: 'hover:bg-blue-500/20 hover:text-blue-400' }
                                            ]},
                                            { step: 2, title: 'SYSTEM_UPDATE', desc: 'BUILD_LATEST_KERNEL', actions: [
                                                { id: 'build', icon: Hammer, color: 'hover:bg-emerald-500/20 hover:text-emerald-400' }
                                            ]},
                                            { step: 3, title: 'DEPLOY_NODE', desc: 'INITIATE_CONTAINER', actions: [
                                                { id: 'run', icon: Play, color: 'bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500 hover:text-black' }
                                            ]},
                                            { step: 4, title: 'VERIFY_SIGNAL', desc: 'FETCH_LOGS_AND_QR', actions: [
                                                { id: 'get_logs', icon: TerminalSquare, color: 'hover:bg-slate-700 hover:text-white' }
                                            ]}
                                        ].map((s, i) => (
                                            <div key={i} className={`relative pl-8 before:absolute before:left-[11px] before:top-8 before:bottom-0 before:w-0.5 last:before:hidden ${theme === 'light' ? 'before:bg-slate-200' : 'before:bg-slate-800'}`}>
                                                <div className={`absolute left-0 top-0 w-6 h-6 rounded-full border flex items-center justify-center text-[10px] font-black ${theme === 'light' ? 'bg-white text-slate-400 border-slate-200' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>{s.step}</div>
                                                <div className="mb-3">
                                                    <h4 className={`text-[10px] font-black uppercase tracking-widest ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`}>{s.title}</h4>
                                                    <p className="text-[8px] text-slate-500 font-bold uppercase">{s.desc}</p>
                                                </div>
                                                <div className="flex gap-2 flex-wrap">
                                                    {s.actions.map(act => (
                                                        <button 
                                                            key={act.id} 
                                                            onClick={() => runControlAction(service.name, service.port, act.id)} 
                                                            disabled={isControlling[`${service.name}-${act.id}`]} 
                                                            className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-20 flex items-center justify-center gap-2 ${theme === 'light' ? 'bg-white border-slate-200 text-slate-500 ' + act.color : 'bg-white/5 border-white/5 text-slate-400 ' + act.color} ${act.id === 'run' || act.id === 'get_logs' ? 'w-full' : ''}`}
                                                        >
                                                            <act.icon className="w-3 h-3" /> {act.id}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Activity Log Overlay */}
                                    <div className={`rounded-xl p-4 font-mono text-[8px] max-h-40 overflow-y-auto border shadow-inner ${theme === 'light' ? 'bg-white border-slate-200 text-slate-500' : 'bg-black/60 border-white/5 text-slate-600'}`}>
                                        {Object.entries(controlLogs).filter(([k]) => k.startsWith(service.name)).length > 0 ? (
                                            Object.entries(controlLogs).filter(([k]) => k.startsWith(service.name)).map(([k, logs]) => (
                                                <div key={k} className="mb-4 last:mb-0">
                                                    <div className="text-cyan-500/50 mb-2 flex items-center gap-2 uppercase tracking-widest">
                                                        {k.split('-').pop()} {isControlling[k] && <Activity className="w-2 h-2 animate-pulse" />}
                                                    </div>
                                                    {logs.map((l, i) => {
                                                        const waMatch = l.match(WA_LINK_REGEX);
                                                        return (
                                                            <div key={i} className="mb-1.5 leading-relaxed break-all">
                                                                {maskSensitives(l)}
                                                                {waMatch && (
                                                                    <div className="mt-4 bg-white p-4 rounded-2xl border-4 border-cyan-500 inline-block shadow-2xl scale-90 origin-left">
                                                                        <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(waMatch[0])}`} className="w-40 h-40" />
                                                                        <p className="text-black font-black text-center mt-2 text-[10px] tracking-widest uppercase">SCAN_AUTH</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="text-center py-4 opacity-30 italic">NO_ACTIVITY_LOGGED</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Status Grid v2 */}
                    <section className="space-y-6">
                        <div className="flex items-center justify-between px-2">
                            <div className="flex items-center gap-4">
                                <Radio className="w-5 h-5 text-cyan-500 animate-pulse" />
                                <h3 className={`text-xs font-black uppercase tracking-[0.5em] ${theme === 'light' ? 'text-slate-800' : 'text-slate-100'}`}>Telemetry_Summary</h3>
                            </div>
                            <button 
                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                className={`p-3 rounded-2xl border transition-all ${theme === 'light' ? 'bg-white border-slate-200 text-slate-400 hover:text-cyan-500 hover:border-cyan-500' : 'bg-white/5 border-white/5 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/50'}`}
                            >
                                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                            {SERVICES.map(service => {
                                const s = serviceState[service.port] || { status: 'IDLE', message: '-', time: '-', log: '' };
                                const statusInfo = getConnectionStatusBadge(s.connectionStatus);
                                return (
                                    <div key={service.port} className={`backdrop-blur-md border rounded-3xl p-6 transition-all group overflow-hidden relative ${theme === 'light' ? 'bg-white/80 border-slate-200 hover:border-cyan-500/50' : 'bg-slate-900/40 border-white/5 hover:border-cyan-500/30'}`}>
                                        <div className={`absolute top-0 right-0 w-32 h-32 blur-3xl -mr-16 -mt-16 pointer-events-none ${theme === 'light' ? 'bg-cyan-500/10' : 'bg-cyan-500/5'}`}></div>
                                        <div className="flex justify-between items-start mb-6">
                                            <div className="space-y-1">
                                                <p className={`text-[8px] uppercase font-bold tracking-widest ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>NODE_IDENTIFIER</p>
                                                <p className={`text-[10px] font-bold uppercase transition-colors ${theme === 'light' ? 'text-slate-900' : 'text-white group-hover:text-cyan-400'}`}>{service.name}</p>
                                                <span className={`text-[8px] px-2 py-0.5 rounded font-black tracking-widest uppercase border mt-2 inline-block ${theme === 'light' ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-black/40 text-slate-400 border-white/5'}`}>PORT_{service.port}</span>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <div className={`px-3 py-1 rounded-full text-[8px] font-black border flex items-center gap-2 ${statusInfo.badge}`}>
                                                    <span className="animate-pulse">{statusInfo.icon}</span> {statusInfo.label}
                                                </div>
                                                <button 
                                                    onClick={() => startMonitoring(null, service.port)}
                                                    disabled={isMonitoring}
                                                    className={`px-4 py-1.5 rounded-lg flex items-center gap-2 text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-20 border ${theme === 'light' ? 'bg-slate-900 text-white hover:bg-cyan-600 border-transparent' : 'bg-white/10 text-white hover:bg-white hover:text-black border-white/10'}`}
                                                >
                                                    <Play className="w-3 h-3 fill-current" /> Manual_Test
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 mb-6">
                                            <div className="space-y-1">
                                                <p className={`text-[8px] uppercase font-bold tracking-widest ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>SIGNAL_STATUS</p>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${s.status === 'SUCCESS' ? 'bg-emerald-500' : s.status === 'FAILED' ? 'bg-rose-500' : 'bg-cyan-500'}`}></div>
                                                    <p className={`text-[10px] font-bold uppercase tracking-tighter ${theme === 'light' ? 'text-slate-700' : 'text-white'}`}>{s.status}</p>
                                                </div>
                                                <p className={`text-[9px] font-bold uppercase truncate ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>{(s.message || '-')}</p>
                                            </div>
                                            <div className="space-y-1 text-right">
                                                <p className={`text-[8px] uppercase font-bold tracking-widest ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>LAST_SYNC</p>
                                                <p className={`text-[10px] font-bold font-mono ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}>{s.time}</p>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center px-1">
                                                <p className={`text-[8px] uppercase font-bold tracking-widest ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>TERMINAL_OUTPUT</p>
                                            </div>
                                            <div className={`p-3 rounded-2xl border text-[9px] font-mono h-24 overflow-y-auto leading-relaxed shadow-inner group-hover:text-cyan-600 transition-colors ${theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-black/40 border-white/5 text-slate-500'}`}>
                                                {maskSensitives(s.log)}
                                            </div>
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
