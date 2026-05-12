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
    Activity
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

    const maskSensitives = (text) => {
        if (!text) return text;
        // Mask IPs like 10.70.0.118 -> 10.70.*.*
        let masked = text.replace(/\b(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.*.*');
        // Mask specific port patterns like :2222 or :8001
        masked = masked.replace(/:(\d{4,5})\b/g, ':****');
        return masked;
    };

    useEffect(() => {
        const source = new EventSource('/api/logs/errors');

        source.addEventListener('open', () => {
            setErrorStreamStatus('CONNECTED');
        });

        source.addEventListener('status', () => {
            setErrorStreamStatus('CONNECTED');
        });

        source.addEventListener('error_log', (event) => {
            const data = JSON.parse(event.data);
            setErrorLogs(prev => [data, ...prev].slice(0, 100));
        });

        source.addEventListener('stream_error', (event) => {
            const data = JSON.parse(event.data);
            setErrorLogs(prev => [{
                ...data,
                line: data.message,
                time: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
            }, ...prev].slice(0, 100));
        });

        source.addEventListener('error', () => {
            setErrorStreamStatus('DISCONNECTED');
        });

        return () => {
            source.close();
        };
    }, []);

    const startMonitoring = async (e, port = null) => {
        if (e) e.preventDefault();
        setIsMonitoring(true);
        setIsConnected(false);
        lastPortRef.current = port;
        if (!port) setStats({ success: 0, failed: 0, delay: 0 });
        
        // Reset services
        if (port) {
            setServiceState(prev => ({
                ...prev,
                [port]: { status: 'IDLE', time: '-', log: 'Waiting to start...', message: '-', connectionStatus: 'CONNECTING', logs: [] }
            }));
            setConsoleMsg(`Connecting to API for port ${port}...`);
        } else {
            const resetState = {};
            SERVICES.forEach(s => {
                resetState[s.port] = { status: 'IDLE', time: '-', log: 'Waiting to start...', message: '-', connectionStatus: 'CONNECTING', logs: [] };
            });
            setServiceState(resetState);
            setConsoleMsg('Connecting to API...');
        }

        try {
            const response = await fetch('/api/monitor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ targetNumber, servicePort: port })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            // connection established
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
                        const eventType = eventMatch[1];
                        const data = JSON.parse(dataMatch[1]);
                        
                        handleEvent(eventType, data);
                    }
                }
            }
        } catch (err) {
            setIsConnected(false);
            setIsMonitoring(false);
            setConsoleMsg(`Connection error: ${err.message}. Auto scan dimatikan, klik Start Scan untuk mencoba lagi.`);
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

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

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
                        } else if (event === 'status') {
                            setConsoleMsg(data.message);
                        } else if (event === 'done') {
                            setConsoleMsg(`${action} for ${serviceName} finished: ${data.message}`);
                        }
                    }
                }
            }
        } catch (err) {
            setControlLogs(prev => ({
                ...prev,
                [key]: [...(prev[key] || []), `Error: ${err.message}`]
            }));
            setConsoleMsg(`Control error: ${err.message}`);
        } finally {
            setIsControlling(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleEvent = (event, data) => {
        if (event === 'status') {
            setConsoleMsg(data.message);
        } 
        else if (event === 'error') {
            setConsoleMsg(data.message);
            setIsMonitoring(false);
        }
        else if (event === 'service_start') {
            setServiceState(prev => ({
                ...prev,
                [data.port]: { 
                    status: 'RUNNING', 
                    message: 'Sending Message...', 
                    time: data.time, 
                    log: 'Checking docker logs...', 
                    connectionStatus: 'CONNECTED',
                    logs: [...(prev[data.port].logs || []), `[${new Date().toLocaleTimeString()}] Service started`]
                }
            }));
        }
        else if (event === 'service_result') {
            setServiceState(prev => ({
                ...prev,
                [data.port]: { 
                    status: data.status, 
                    message: data.message, 
                    time: data.time || prev[data.port].time, 
                    log: data.detail || 'No detail available',
                    connectionStatus: 'CONNECTED',
                    logs: [...(prev[data.port].logs || []), `[${new Date().toLocaleTimeString()}] ${data.status}: ${data.message}`]
                }
            }));

            if (data.status === 'SUCCESS') setStats(s => ({ ...s, success: s.success + 1 }));
            else if (data.status === 'FAILED') setStats(s => ({ ...s, failed: s.failed + 1 }));
            else setStats(s => ({ ...s, delay: s.delay + 1 }));
        }
        else if (event === 'done') {
            setConsoleMsg(`Monitoring selesai. Total: ${data.total}, Berhasil: ${data.successCount}, Gagal: ${data.failedCount}, Delay: ${data.delayCount}`);
            setIsMonitoring(false);
        }
    };

    const getStatusColors = (status) => {
        switch(status) {
            case 'RUNNING': return 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 before:bg-indigo-500';
            case 'SUCCESS': return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 before:bg-emerald-500';
            case 'FAILED': return 'bg-red-500/10 border-red-500/20 text-red-400 before:bg-red-500';
            case 'DELAY': return 'bg-amber-500/10 border-amber-500/20 text-amber-400 before:bg-amber-500';
            default: return 'bg-white/5 border-white/10 text-slate-400 before:bg-slate-700';
        }
    };

    const getConnectionStatusBadge = (connStatus) => {
        switch(connStatus) {
            case 'CONNECTED': 
                return { badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', icon: '🟢', label: 'Connected' };
            case 'DISCONNECTED': 
                return { badge: 'bg-red-500/20 text-red-300 border border-red-500/30', icon: '🔴', label: 'Disconnected' };
            case 'CONNECTING': 
                return { badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30', icon: '🟡', label: 'Connecting...' };
            case 'ERROR': 
                return { badge: 'bg-red-500/20 text-red-300 border border-red-500/30', icon: '❌', label: 'Error' };
            default: 
                return { badge: 'bg-slate-500/20 text-slate-300 border border-slate-500/30', icon: '⚪', label: 'Idle' };
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 font-sans relative overflow-x-hidden selection:bg-blue-500/30">
            {/* Background Effects */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/10 blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-600/10 blur-[120px]" />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header Section */}
                <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-10 pb-6 border-b border-white/10">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-3 break-words">
                            <svg className="w-8 h-8 text-emerald-500" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                            WA API Central Monitor — Digi Transaksi Production
                        </h1>
                        <p className="text-slate-400 mt-2 text-xs sm:text-sm">Real-time status monitoring untuk WhatsApp Gateway API</p>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                        <div className="relative group flex-1 sm:flex-none">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Phone className="h-5 w-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                            </div>
                            <input 
                                type="text" 
                                value={targetNumber}
                                onChange={(e) => setTargetNumber(e.target.value)}
                                placeholder="Target Number" 
                                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all backdrop-blur-sm"
                            />
                        </div>
                            
                        <button 
                            type="button"
                            onClick={() => startMonitoring(null, null)}
                            disabled={isMonitoring}
                            className="flex-none whitespace-nowrap flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-medium px-4 py-2.5 rounded-md transition-shadow shadow-sm disabled:opacity-60 disabled:shadow-none"
                        >
                            {isMonitoring ? (
                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Play className="w-5 h-5" />
                            )}
                            {isMonitoring ? 'Monitoring...' : 'Start Scan'}
                        </button>
                    </div>

                    {/* Connection banner */}
                    {isMonitoring && !isConnected ? (
                        <div className="mt-3 p-3 rounded bg-amber-600/10 border border-amber-500/20 text-amber-300 text-sm flex items-center justify-between gap-3">
                            <div>Disconnected — trying to reconnect...</div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => startMonitoring(null, lastPortRef.current)} className="bg-amber-500 hover:bg-amber-400 text-black px-2 py-1 rounded text-xs">Reconnect</button>
                            </div>
                        </div>
                    ) : null}
                </header>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5 backdrop-blur-xl flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                            <Server className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm font-medium">Total Services</p>
                            <p className="text-2xl font-bold text-white">{SERVICES.length}</p>
                        </div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5 backdrop-blur-xl flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                            <CheckCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm font-medium">Berhasil</p>
                            <p className="text-2xl font-bold text-white">{stats.success}</p>
                        </div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5 backdrop-blur-xl flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-400">
                            <XCircle className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm font-medium">Gagal</p>
                            <p className="text-2xl font-bold text-white">{stats.failed}</p>
                        </div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl p-5 backdrop-blur-xl flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-slate-400 text-sm font-medium">Delay</p>
                            <p className="text-2xl font-bold text-white">{stats.delay}</p>
                        </div>
                    </div>
                </div>

                {/* Console */}
                <div className="bg-slate-900/80 border border-slate-700/50 rounded-xl p-4 mb-8 font-mono text-sm text-slate-300 flex items-center gap-3 shadow-inner backdrop-blur-xl">
                    <TerminalSquare className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <span className="animate-pulse">{consoleMsg}</span>
                </div>

                {/* Realtime Error Logs */}
                <div className="bg-slate-900/70 border border-red-500/20 rounded-xl mb-8 overflow-hidden backdrop-blur-xl shadow-lg">
                    <div className="px-5 py-4 border-b border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-red-500/10 text-red-300 flex items-center justify-center">
                                <Radio className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-100">Realtime Error Logs</h3>
                                <p className="text-xs text-slate-400">docker logs -f service 2&gt;&amp;1 | egrep -i error</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider border ${
                                errorStreamStatus === 'CONNECTED'
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                    : 'bg-red-500/10 text-red-300 border-red-500/30'
                            }`}>
                                {errorStreamStatus}
                            </span>
                            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                                {errorLogs.length} Logs
                            </span>
                            <button
                                type="button"
                                onClick={() => setErrorLogs([])}
                                className="h-8 w-8 rounded-md bg-slate-800/80 hover:bg-red-600 border border-slate-700 hover:border-red-500 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                                title="Clear logs"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="h-72 overflow-y-auto bg-black/30 font-mono text-xs">
                        {errorLogs.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-slate-500 px-4 text-center">
                                Menunggu error log realtime. Panel ini tidak menjalankan scan WhatsApp.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-800/80">
                                {errorLogs.map((log, idx) => {
                                    let emitcode = null;
                                    let displayLine = log.line;
                                    
                                    try {
                                        // Handle potential JSON log with emitcode
                                        if (log.line.trim().startsWith('{')) {
                                            const parsed = JSON.parse(log.line);
                                            emitcode = parsed.emitcode || parsed.code || parsed.emit;
                                            displayLine = parsed.message || parsed.msg || log.line;
                                        } else {
                                            // Handle "QR code: https://wa.me/..."
                                            const qrMatch = log.line.match(/QR code:\s+(https:\/\/wa\.me\/[^\s]+)/i);
                                            if (qrMatch) {
                                                emitcode = 'QR-LINK';
                                            } else {
                                                // Fallback regex for "emitcode":"..." or similar
                                                const match = log.line.match(/emitcode["\s:]+([^"\s,}\]]+)/i);
                                                if (match) emitcode = match[1].replace(/["']/g, '');
                                            }
                                        }
                                    } catch (e) {}

                                    return (
                                        <div key={`${log.port}-${log.time}-${idx}`} className="p-3 hover:bg-red-500/5 transition-colors border-b border-slate-800/50 last:border-0">
                                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                                                <span className="text-red-300 font-bold">{log.name}</span>
                                                <span className="text-slate-500">Port {log.port}</span>
                                                {emitcode && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse">
                                                            CODE: {emitcode}
                                                        </span>
                                                        {emitcode === 'QR-LINK' && (
                                                            <div className="relative group">
                                                                <div className="bg-white p-2 rounded-lg shadow-xl border-2 border-blue-500 cursor-pointer">
                                                                    <img 
                                                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(log.line.match(/https:\/\/wa\.me\/[^\s]+/i)?.[0] || '')}`} 
                                                                        alt="QR Code"
                                                                        className="w-24 h-24 sm:w-40 sm:h-40"
                                                                    />
                                                                </div>
                                                                {/* Hover to enlarge */}
                                                                <div className="absolute left-0 top-0 hidden group-hover:block z-50 transform -translate-y-full mb-2">
                                                                    <div className="bg-white p-4 rounded-2xl shadow-2xl border-4 border-blue-500">
                                                                        <img 
                                                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(log.line.match(/https:\/\/wa\.me\/[^\s]+/i)?.[0] || '')}`} 
                                                                            alt="QR Code Large"
                                                                            className="w-64 h-64 sm:w-96 sm:h-96"
                                                                        />
                                                                        <p className="text-sm text-black text-center font-bold mt-2 uppercase tracking-widest">Scan via WhatsApp</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                                    log.source === 'history'
                                                        ? 'bg-slate-700 text-slate-300'
                                                        : 'bg-red-500/20 text-red-300'
                                                }`}>
                                                    {log.source || 'live'}
                                                </span>
                                                <span className="text-slate-500">{log.time}</span>
                                            </div>
                                            <div className="text-slate-300 break-all leading-relaxed font-mono text-[11px]">
                                                {maskSensitives(displayLine).split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                                                    part.match(/^https?:\/\//) 
                                                        ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">{part}</a>
                                                        : part
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Docker & Database Management */}
                <div className="mb-12">
                    <div className="px-5 py-4 bg-slate-900/60 border border-slate-700/50 rounded-t-xl flex items-center justify-between gap-3 shadow-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-300 flex items-center justify-center">
                                <Settings2 className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Docker & Service Management</h3>
                                <p className="text-xs text-slate-400">Control container status, build image, and database maintenance</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                                <Activity className="w-3 h-3 text-emerald-400" /> System Control Ready
                            </span>
                        </div>
                    </div>
                    <div className="p-5 bg-slate-950/40 rounded-b-xl border border-t-0 border-slate-700/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {SERVICES.map(service => (
                                <div key={`manage-${service.port}`} className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6 flex flex-col gap-6 hover:border-slate-700 transition-all hover:shadow-2xl group">
                                    <div className="flex justify-between items-center border-b border-white/5 pb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                                <Server className="w-4 h-4" />
                                            </div>
                                            <div className="font-bold text-lg text-slate-100 tracking-tight">{service.name}</div>
                                        </div>
                                        <div className="text-[10px] text-slate-500 font-mono bg-slate-800/50 px-2 py-1 rounded">PORT: {service.port}</div>
                                    </div>

                                    {/* Step-by-Step Workflow */}
                                    <div className="space-y-6">
                                        {/* Step 1: Cleanup */}
                                        <div className="relative pl-8 before:absolute before:left-[11px] before:top-8 before:bottom-0 before:w-0.5 before:bg-slate-800">
                                            <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center text-[10px] font-bold">1</div>
                                            <div className="mb-3">
                                                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Step 1: Bersihkan System</h4>
                                                <p className="text-[10px] text-slate-500">Hentikan kontainer dan hapus database lama jika bermasalah.</p>
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                <button 
                                                    onClick={() => runControlAction(service.name, service.port, 'stop')}
                                                    disabled={isControlling[`${service.name}-stop`]}
                                                    className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg bg-slate-800 hover:bg-amber-600/20 border border-slate-700 hover:border-amber-500/50 text-slate-400 hover:text-amber-300 transition-all text-[9px] font-bold uppercase group disabled:opacity-50"
                                                >
                                                    <Square className="w-3 h-3 group-hover:scale-110 transition-transform" />
                                                    Stop
                                                </button>
                                                <button 
                                                    onClick={() => runControlAction(service.name, service.port, 'rm')}
                                                    disabled={isControlling[`${service.name}-rm`]}
                                                    className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg bg-slate-800 hover:bg-red-600/20 border border-slate-700 hover:border-red-500/50 text-slate-400 hover:text-red-300 transition-all text-[9px] font-bold uppercase group disabled:opacity-50"
                                                >
                                                    <Trash2 className="w-3 h-3 group-hover:scale-110 transition-transform" />
                                                    Hapus
                                                </button>
                                                <button 
                                                    onClick={() => runControlAction(service.name, service.port, 'reset_db')}
                                                    disabled={isControlling[`${service.name}-reset_db`]}
                                                    className="flex flex-col items-center justify-center gap-1.5 p-2 rounded-lg bg-slate-800 hover:bg-blue-600/20 border border-slate-700 hover:border-blue-500/50 text-slate-400 hover:text-blue-300 transition-all text-[9px] font-bold uppercase group disabled:opacity-50"
                                                >
                                                    <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />
                                                    Reset DB
                                                </button>
                                            </div>
                                        </div>

                                        {/* Step 2: Build */}
                                        <div className="relative pl-8 before:absolute before:left-[11px] before:top-8 before:bottom-0 before:w-0.5 before:bg-slate-800">
                                            <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center text-[10px] font-bold">2</div>
                                            <div className="mb-3">
                                                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Step 2: Update Sistem</h4>
                                                <p className="text-[10px] text-slate-500">Bangun ulang image untuk memperbarui kode program.</p>
                                            </div>
                                            <button 
                                                onClick={() => runControlAction(service.name, service.port, 'build')}
                                                disabled={isControlling[`${service.name}-build`]}
                                                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-800 hover:bg-emerald-600/20 border border-slate-700 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-300 transition-all text-[10px] font-bold uppercase disabled:opacity-50"
                                            >
                                                <Hammer className="w-4 h-4" /> Build Alpha
                                            </button>
                                        </div>

                                        {/* Step 3: Deploy */}
                                        <div className="relative pl-8 before:absolute before:left-[11px] before:top-8 before:bottom-0 before:w-0.5 before:bg-slate-800">
                                            <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center text-[10px] font-bold">3</div>
                                            <div className="mb-3">
                                                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Step 3: Jalankan</h4>
                                                <p className="text-[10px] text-slate-500">Jalankan kontainer baru ke dalam server.</p>
                                            </div>
                                            <button 
                                                onClick={() => runControlAction(service.name, service.port, 'run')}
                                                disabled={isControlling[`${service.name}-run`]}
                                                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all text-[10px] font-bold uppercase shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                                            >
                                                <Play className="w-4 h-4" /> Run Container
                                            </button>
                                        </div>

                                        {/* Step 4: Verify */}
                                        <div className="relative pl-8">
                                            <div className="absolute left-0 top-0 w-6 h-6 rounded-full bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center text-[10px] font-bold">4</div>
                                            <div className="mb-3">
                                                <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Step 4: Cek Log & QR</h4>
                                                <p className="text-[10px] text-slate-500">Ambil log terbaru untuk melakukan scan QR link.</p>
                                            </div>
                                            <button 
                                                onClick={() => runControlAction(service.name, service.port, 'get_logs')}
                                                disabled={isControlling[`${service.name}-get_logs`]}
                                                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-all text-[10px] font-bold uppercase disabled:opacity-50"
                                            >
                                                <TerminalSquare className="w-4 h-4" /> Get Latest Logs
                                            </button>
                                        </div>
                                    </div>

                                    {/* Action Logs Viewer */}
                                    <div className="mt-2 min-h-[100px] h-auto max-h-[500px] overflow-y-auto bg-black/40 rounded-xl border border-slate-800/50 p-4 font-mono text-[9px] text-slate-500 shadow-inner">
                                        {['stop', 'rm', 'reset_db', 'build', 'run', 'get_logs'].map(action => {
                                            const logs = controlLogs[`${service.name}-${action}`];
                                            if (!logs) return null;
                                            return (
                                                <div key={action} className="mb-4 last:mb-0 border-b border-white/5 pb-4 last:border-0">
                                                    <div className="text-slate-400 font-bold uppercase mb-2 flex justify-between items-center">
                                                        <span className="flex items-center gap-2">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                                            {action}
                                                        </span>
                                                        {isControlling[`${service.name}-${action}`] && <Activity className="w-3 h-3 animate-pulse text-blue-400" />}
                                                    </div>
                                                    {logs.map((l, i) => {
                                                        const qrMatch = l.match(/https:\/\/wa\.me\/[^\s]+/i);
                                                        const maskedLine = maskSensitives(l);
                                                        return (
                                                            <div key={i} className="whitespace-pre-wrap mb-1 leading-relaxed">
                                                                {maskedLine}
                                                                {qrMatch && (
                                                                    <div className="mt-3 bg-white p-4 rounded-xl inline-block border-4 border-blue-500 shadow-2xl">
                                                                        <img 
                                                                            src={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrMatch[0])}`} 
                                                                            alt="QR Code"
                                                                            className="w-64 h-64 sm:w-80 sm:h-80"
                                                                        />
                                                                        <p className="text-sm text-black font-black text-center mt-2 uppercase tracking-widest">SCAN SEKARANG</p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })}
                                        {!Object.keys(controlLogs).some(k => k.startsWith(service.name)) && (
                                            <div className="h-full py-8 flex flex-col items-center justify-center text-slate-700 italic gap-2">
                                                <Activity className="w-5 h-5 opacity-20" />
                                                <span>Menunggu aksi bantuan...</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}

                        </div>
                    </div>
                </div>

                {/* Service Status Details Grid */}
                <div className="mb-8">
                    <div className="px-5 py-4 bg-slate-900/60 border border-slate-700/50 rounded-t-xl flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-300 flex items-center justify-center">
                            <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Service Status Details</h3>
                            <p className="text-xs text-slate-400">Monitoring status untuk setiap service</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 p-5 bg-slate-950/40 rounded-b-xl border border-t-0 border-slate-700/50">
                        {SERVICES.map(service => {
                            const sState = serviceState[service.port];
                            const colorClass = getStatusColors(sState.status);
                            
                            return (
                                <div 
                                    key={service.port}
                                    className={`relative overflow-hidden rounded-2xl bg-slate-900/40 border backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${colorClass.split(' before:')[0]} before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 ${colorClass.split(' ').find(c => c.startsWith('before:'))}`}
                                >
                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                                                    {service.name}
                                                </h3>
                                                <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 mt-1 inline-block">Port: {service.port}</span>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                                                    sState.status === 'IDLE' ? 'bg-slate-800 text-slate-400' :
                                                    sState.status === 'RUNNING' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' :
                                                    sState.status === 'SUCCESS' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                                                    sState.status === 'FAILED' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
                                                    'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                }`}>
                                                    {sState.status === 'RUNNING' ? (
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" /> RUNNING
                                                        </span>
                                                    ) : sState.status}
                                                </span>
                                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${getConnectionStatusBadge(sState.connectionStatus).badge}`}>
                                                    {getConnectionStatusBadge(sState.connectionStatus).icon} {getConnectionStatusBadge(sState.connectionStatus).label}
                                                </span>
                                                <button 
                                                    onClick={() => startMonitoring(null, service.port)}
                                                    disabled={isMonitoring}
                                                    className="bg-slate-800/80 hover:bg-blue-600 border border-slate-700 hover:border-blue-500 text-slate-300 hover:text-white px-2.5 py-1 rounded flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                                >
                                                    <Play className="w-3 h-3" /> Test
                                                </button>
                                            </div>
                                        </div>
                                        
                                        <div className="space-y-2 mt-4 pt-4 border-t border-slate-700/50 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-slate-400">Status</span>
                                                <span className="font-medium text-slate-200">{sState.message || '-'}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-slate-400">Time</span>
                                                <span className="font-mono text-slate-300">{sState.time}</span>
                                            </div>
                                        </div>

                                        <div className="mt-4 p-3 bg-black/40 rounded-lg text-xs font-mono text-slate-400 h-20 overflow-y-auto break-all border border-slate-800/50 shadow-inner">
                                            {sState.log}
                                        </div>

                                        {sState.logs && sState.logs.length > 0 && (
                                            <div className="mt-3 p-2 bg-slate-900/50 rounded-lg text-xs font-mono text-slate-500 border border-slate-700/30 max-h-24 overflow-y-auto">
                                                <div className="font-semibold text-slate-300 mb-1">Event Log:</div>
                                                {sState.logs.map((log, idx) => (
                                                    <div key={idx} className="text-[10px] text-slate-400">{log}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
