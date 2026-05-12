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
    Search
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

export default function Home() {
    const [targetNumber, setTargetNumber] = useState('0895370034003');
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const lastPortRef = useRef(null);
    const [consoleMsg, setConsoleMsg] = useState('Ready to start monitoring...');
    const [stats, setStats] = useState({ success: 0, failed: 0, delay: 0 });
    const [errorLogs, setErrorLogs] = useState([]);
    const [errorStreamStatus, setErrorStreamStatus] = useState('CONNECTING');
    const [controlLogs, setControlLogs] = useState({});
    const [isControlling, setIsControlling] = useState({});
    
    const [serviceState, setServiceState] = useState(
        SERVICES.reduce((acc, s) => {
            acc[s.port] = { status: 'IDLE', time: '-', log: 'Waiting to start...', connectionStatus: 'IDLE', logs: [] };
            return acc;
        }, {})
    );

    const [logSearch, setLogSearch] = useState('');
    const [isReconnecting, setIsReconnecting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const logsPerPage = 5;

    const filteredLogs = errorLogs.filter(log => 
        log.name?.toLowerCase().includes(logSearch.toLowerCase()) || 
        log.line?.toLowerCase().includes(logSearch.toLowerCase()) ||
        log.port?.toString().includes(logSearch)
    );

    const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
    const paginatedLogs = filteredLogs.slice((currentPage - 1) * logsPerPage, currentPage * logsPerPage);

    useEffect(() => {
        // Reset to page 1 when search changes
        setCurrentPage(1);
    }, [logSearch]);

    const getEmitCode = (line) => {
        if (!line) return null;
        const qrMatch = line.match(/https:\/\/wa\.me\/[^\s]+/i);
        if (qrMatch) return 'QR-LINK';
        
        const emitMatch = line.match(/emitcode["\s:]+([^"\s,}\]]+)/i);
        if (emitMatch) return emitMatch[1].replace(/["']/g, '');
        
        return null;
    };

    const handleReconnectLogs = () => {
        setIsReconnecting(true);
        setErrorLogs([]);
        setTimeout(() => setIsReconnecting(false), 1000);
    };

    const maskSensitives = (text) => {
        if (!text) return text;
        let masked = text.replace(/\b(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.*.*');
        masked = masked.replace(/:(\d{4,5})\b/g, ':****');
        return masked;
    };

    useEffect(() => {
        const source = new EventSource('/api/logs/errors');
        source.addEventListener('open', () => setErrorStreamStatus('CONNECTED'));
        source.addEventListener('status', () => setErrorStreamStatus('CONNECTED'));
        source.addEventListener('error_log', (event) => {
            const data = JSON.parse(event.data);
            setErrorLogs(prev => [data, ...prev].slice(0, 100));
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
        
        if (port) {
            setServiceState(prev => ({
                ...prev,
                [port]: { status: 'IDLE', time: '-', log: 'Waiting to start...', message: '-', connectionStatus: 'CONNECTING', logs: [] }
            }));
        } else {
            const resetState = {};
            SERVICES.forEach(s => {
                resetState[s.port] = { status: 'IDLE', time: '-', log: 'Waiting to start...', message: '-', connectionStatus: 'CONNECTING', logs: [] };
            });
            setServiceState(resetState);
        }

        try {
            const response = await fetch('/api/monitor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetNumber, servicePort: port })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
                for (let chunk of lines) {
                    if (chunk.trim() === '') continue;
                    const eventMatch = chunk.match(/event: (.*)\n/);
                    const dataMatch = chunk.match(/data: (.*)/);
                    if (eventMatch && dataMatch) {
                        handleEvent(eventMatch[1], JSON.parse(dataMatch[1]));
                    }
                }
            }
        } catch (err) {
            setIsConnected(false);
            setIsMonitoring(false);
            setConsoleMsg(`Connection error: ${err.message}`);
        }
    };

    const runControlAction = async (serviceName, port, action) => {
        const key = `${serviceName}-${action}`;
        setIsControlling(prev => ({ ...prev, [key]: true }));
        setControlLogs(prev => ({ ...prev, [key]: [`[${new Date().toLocaleTimeString()}] Starting ${action}...`] }));

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
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n\n');
                for (let line of lines) {
                    if (!line.trim()) continue;
                    const eventMatch = line.match(/event: (.*)\n/);
                    const dataMatch = line.match(/data: (.*)/);
                    if (eventMatch && dataMatch) {
                        const event = eventMatch[1];
                        const data = JSON.parse(dataMatch[1]);
                        if (event === 'log') {
                            setControlLogs(prev => ({
                                ...prev,
                                [key]: [...(prev[key] || []), data.message]
                            }));
                        }
                    }
                }
            }
        } catch (err) {
            setControlLogs(prev => ({ ...prev, [key]: [...(prev[key] || []), `Error: ${err.message}`] }));
        } finally {
            setIsControlling(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleEvent = (event, data) => {
        if (event === 'status') setConsoleMsg(data.message);
        else if (event === 'service_start') {
            setServiceState(prev => ({
                ...prev,
                [data.port]: { 
                    status: 'RUNNING', message: 'Sending...', time: data.time, log: 'Running...', 
                    connectionStatus: 'CONNECTED', logs: [...(prev[data.port].logs || []), `[${new Date().toLocaleTimeString()}] Started`]
                }
            }));
        }
        else if (event === 'service_result') {
            setServiceState(prev => ({
                ...prev,
                [data.port]: { 
                    status: data.status, message: data.message, time: data.time || prev[data.port].time, log: data.detail || '-',
                    connectionStatus: 'CONNECTED', logs: [...(prev[data.port].logs || []), `[${new Date().toLocaleTimeString()}] ${data.status}`]
                }
            }));
            if (data.status === 'SUCCESS') setStats(s => ({ ...s, success: s.success + 1 }));
            else if (data.status === 'FAILED') setStats(s => ({ ...s, failed: s.failed + 1 }));
        }
        else if (event === 'done') setIsMonitoring(false);
    };

    const getStatusColors = (status) => {
        switch(status) {
            case 'RUNNING': return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 before:bg-indigo-500';
            case 'SUCCESS': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 before:bg-emerald-500';
            case 'FAILED': return 'bg-red-500/10 border-red-500/20 text-red-400 before:bg-red-500';
            default: return 'bg-white/5 border-white/10 text-slate-400 before:bg-slate-700';
        }
    };

    const getConnectionStatusBadge = (connStatus) => {
        switch(connStatus) {
            case 'CONNECTED': return { badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', icon: '🟢', label: 'Connected' };
            case 'CONNECTING': return { badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30', icon: '🟡', label: 'Connecting' };
            default: return { badge: 'bg-slate-500/20 text-slate-300 border border-slate-500/30', icon: '⚪', label: 'Idle' };
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 font-sans relative overflow-x-hidden selection:bg-blue-500/30">
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-600/10 blur-[120px]" />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-4 py-8">
                <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10 pb-6 border-b border-white/10">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-3 italic tracking-tighter">
                            CENTRAL MONITOR WA-API — DIGI TRANSAKSI
                        </h1>
                        <p className="text-slate-400 mt-2 text-sm">Production Environment v3.0</p>
                    </div>
                    
                    <div className="flex gap-4 w-full lg:w-auto">
                        <div className="relative group flex-1 sm:flex-none">
                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                            <input 
                                type="text" 
                                value={targetNumber}
                                onChange={(e) => setTargetNumber(e.target.value)}
                                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                        <button 
                            onClick={() => startMonitoring()}
                            disabled={isMonitoring}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-md font-bold transition-all disabled:opacity-50 flex items-center gap-2"
                        >
                            {isMonitoring ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                            START SCAN
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {[
                        { label: 'Services', val: SERVICES.length, icon: Server, color: 'text-blue-400' },
                        { label: 'Berhasil', val: stats.success, icon: CheckCircle, color: 'text-emerald-400' },
                        { label: 'Gagal', val: stats.failed, icon: XCircle, color: 'text-red-400' },
                        { label: 'Delay', val: stats.delay, icon: AlertTriangle, color: 'text-amber-400' }
                    ].map((s, i) => (
                        <div key={i} className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5 backdrop-blur-xl flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center ${s.color}`}>
                                <s.icon className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-slate-400 text-sm font-medium">{s.label}</p>
                                <p className="text-2xl font-bold text-white">{s.val}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4 mb-8 font-mono text-sm text-slate-300 flex items-center gap-3 shadow-inner">
                    <TerminalSquare className="w-5 h-5 text-blue-400 animate-pulse" />
                    <span>{consoleMsg}</span>
                </div>

                {/* Realtime Logs Section */}
                <div className="mb-12">
                    <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md">
                        <div className="px-6 py-5 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div className="flex items-center gap-4">
                                <Radio className="w-5 h-5 text-red-400 animate-pulse" />
                                <div>
                                    <h3 className="text-sm font-black text-slate-100 uppercase tracking-widest">Realtime Error Stream</h3>
                                    <p className="text-[11px] text-slate-500 italic">docker logs -f | grep error</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input 
                                        type="text" 
                                        placeholder="Cari log..."
                                        value={logSearch}
                                        onChange={(e) => setLogSearch(e.target.value)}
                                        className="bg-slate-950/50 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-2 focus:ring-blue-500 outline-none text-slate-300"
                                    />
                                </div>
                                <button onClick={handleReconnectLogs} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white border border-slate-700">
                                    <RefreshCw className={`w-4 h-4 ${isReconnecting ? 'animate-spin' : ''}`} />
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-950/40 text-[10px] uppercase font-black tracking-widest text-slate-500 border-b border-white/5">
                                        <th className="px-6 py-4">Timestamp</th>
                                        <th className="px-6 py-4">Service</th>
                                        <th className="px-6 py-4">Port</th>
                                        <th className="px-6 py-4">Message & Event</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                                    {paginatedLogs.length === 0 ? (
                                        <tr><td colSpan="4" className="px-6 py-10 text-center text-slate-600 italic">No logs detected...</td></tr>
                                    ) : (
                                        paginatedLogs.map((log, index) => {
                                            const emit = getEmitCode(log.line);
                                            return (
                                                <tr key={index} className="hover:bg-white/[0.02]">
                                                    <td className="px-6 py-4 text-slate-500 whitespace-nowrap">{log.time}</td>
                                                    <td className="px-6 py-4 text-red-300 font-bold whitespace-nowrap">{log.name}</td>
                                                    <td className="px-6 py-4 text-slate-400">{log.port}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-2">
                                                            <div className="text-slate-300 break-all">{maskSensitives(log.line)}</div>
                                                            {emit && (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[9px] font-black uppercase">Event: {emit}</span>
                                                                    {emit === 'QR-LINK' && (
                                                                        <div className="relative group">
                                                                            <div className="bg-white p-1 rounded border border-blue-400"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(log.line.match(/https:\/\/wa\.me\/[^\s]+/)?.[0] || '')}`} className="w-8 h-8" /></div>
                                                                            <div className="absolute bottom-full left-0 hidden group-hover:block z-50 bg-white p-4 rounded-xl border-4 border-blue-500 shadow-2xl mb-2">
                                                                                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(log.line.match(/https:\/\/wa\.me\/[^\s]+/)?.[0] || '')}`} className="w-64 h-64" />
                                                                                <p className="text-[10px] text-black font-black text-center mt-2">SCAN QR</p>
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

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="px-6 py-4 bg-slate-950/20 border-t border-white/5 flex items-center justify-between">
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                                    Showing {Math.min(filteredLogs.length, (currentPage - 1) * logsPerPage + 1)}-{Math.min(filteredLogs.length, currentPage * logsPerPage)} of {filteredLogs.length} logs
                                </div>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700 transition-all"
                                    >
                                        Prev
                                    </button>
                                    <div className="flex items-center gap-1">
                                        {[...Array(Math.min(5, totalPages))].map((_, i) => {
                                            const p = i + 1; // Simplistic pagination, for 1600px width we can show more or keep it simple
                                            return (
                                                <button 
                                                    key={p}
                                                    onClick={() => setCurrentPage(p)}
                                                    className={`w-7 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all ${currentPage === p ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                                                >
                                                    {p}
                                                </button>
                                            );
                                        })}
                                        {totalPages > 5 && <span className="text-slate-600 px-1 text-[10px]">...</span>}
                                    </div>
                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700 transition-all"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Management Section */}
                <div className="mb-12">
                    <div className="px-5 py-4 bg-slate-900/60 border border-slate-700/50 rounded-t-xl flex justify-between items-center shadow-lg">
                        <div className="flex items-center gap-3">
                            <Settings2 className="w-5 h-5 text-amber-300" />
                            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Service Management</h3>
                        </div>
                        <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 uppercase">System Ready</span>
                    </div>
                    <div className="p-5 bg-slate-950/40 rounded-b-xl border border-t-0 border-slate-700/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {SERVICES.map(service => (
                                <div key={service.port} className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 hover:border-slate-700 transition-all">
                                    <div className="flex justify-between items-center border-b border-white/5 pb-4">
                                        <div className="flex items-center gap-2 font-bold text-slate-100 italic tracking-tight uppercase text-sm">
                                            <Server className="w-4 h-4 text-blue-500" /> {service.name}
                                        </div>
                                        <span className="text-[9px] text-slate-500 font-mono bg-slate-800 px-2 py-0.5 rounded">PORT: {service.port}</span>
                                    </div>

                                    <div className="space-y-6">
                                        {[
                                            { step: 1, title: 'Cleanup', desc: 'Stop, Remove & Reset DB', actions: ['stop', 'rm', 'reset_db'], icon: Trash2 },
                                            { step: 2, title: 'Update', desc: 'Build Latest Image', actions: ['build'], icon: Hammer },
                                            { step: 3, title: 'Deploy', desc: 'Run Container', actions: ['run'], icon: Play },
                                            { step: 4, title: 'Verify', desc: 'Get Logs & QR', actions: ['get_logs'], icon: TerminalSquare }
                                        ].map((s, i) => (
                                            <div key={i} className="relative pl-8 before:absolute before:left-[11px] before:top-8 before:bottom-0 before:w-0.5 before:bg-slate-800 last:before:hidden">
                                                <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center text-[10px] font-bold">{s.step}</div>
                                                <div className="mb-3">
                                                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-widest">{s.title}</h4>
                                                    <p className="text-[9px] text-slate-500">{s.desc}</p>
                                                </div>
                                                <div className="flex gap-2 flex-wrap">
                                                    {s.actions.map(act => (
                                                        <button key={act} onClick={() => runControlAction(service.name, service.port, act)} disabled={isControlling[`${service.name}-${act}`]} className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase border border-slate-700 transition-all disabled:opacity-50">
                                                            {act}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-2 min-h-[80px] max-h-[300px] overflow-y-auto bg-black/40 rounded-xl border border-slate-800 p-4 font-mono text-[9px] text-slate-500 shadow-inner">
                                        {Object.entries(controlLogs).filter(([k]) => k.startsWith(service.name)).map(([k, logs]) => (
                                            <div key={k} className="mb-4 border-b border-white/5 pb-2 last:border-0">
                                                <div className="text-slate-400 font-bold uppercase mb-1 flex justify-between">{k.split('-').slice(1).join('-')} {isControlling[k] && <Activity className="w-3 h-3 animate-pulse text-blue-400" />}</div>
                                                {logs.map((l, i) => (
                                                    <div key={i} className="whitespace-pre-wrap mb-1">
                                                        {maskSensitives(l)}
                                                        {l.match(/https:\/\/wa\.me\/[^\s]+/i) && (
                                                            <div className="mt-2 bg-white p-4 rounded-xl border-4 border-blue-500 shadow-2xl inline-block"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(l.match(/https:\/\/wa\.me\/[^\s]+/i)[0])}`} className="w-48 h-48" /><p className="text-black font-black text-center mt-1 uppercase text-xs">SCAN QR</p></div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Status Grid */}
                <div className="mb-8">
                    <div className="px-5 py-4 bg-slate-900/60 border border-slate-700/50 rounded-t-xl flex items-center gap-3"><Radio className="w-4 h-4 text-blue-400" /> <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Service Status Details</h3></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 p-5 bg-slate-950/40 rounded-b-xl border border-t-0 border-slate-700/50">
                        {SERVICES.map(service => {
                            const s = serviceState[service.port];
                            return (
                                <div key={service.port} className={`rounded-2xl bg-slate-900/40 border border-slate-800 p-5 backdrop-blur-xl ${getStatusColors(s.status)} before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 relative overflow-hidden`}>
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="font-bold text-slate-100">{service.name}</div>
                                        <div className={`text-[9px] font-bold px-2 py-1 rounded-full uppercase ${getConnectionStatusBadge(s.connectionStatus).badge}`}>{getConnectionStatusBadge(s.connectionStatus).label}</div>
                                    </div>
                                    <div className="space-y-1 text-[10px] text-slate-400">
                                        <div className="flex justify-between"><span>Status</span><span className="text-slate-200">{s.message}</span></div>
                                        <div className="flex justify-between"><span>Time</span><span className="text-slate-300 font-mono">{s.time}</span></div>
                                    </div>
                                    <div className="mt-3 p-2 bg-black/40 rounded border border-slate-800 text-[9px] font-mono h-16 overflow-y-auto">{maskSensitives(s.log)}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
