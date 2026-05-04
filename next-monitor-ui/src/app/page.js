"use client";

import { useState, useRef, useEffect } from 'react';
import {
    Server, 
    CheckCircle, 
    XCircle, 
    AlertTriangle,
    Key,
    Phone,
    Play,
    TerminalSquare
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
    const [password, setPassword] = useState('');
    const [targetNumber, setTargetNumber] = useState('0895370034003');
    const [isMonitoring, setIsMonitoring] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [retryDelay, setRetryDelay] = useState(2000);
    const reconnectTimerRef = useRef(null);
    const lastPortRef = useRef(null);
    const [consoleMsg, setConsoleMsg] = useState('System Ready. Masukkan password untuk memulai monitoring...');
    const [stats, setStats] = useState({ success: 0, failed: 0, delay: 0 });
    
    const [serviceState, setServiceState] = useState(
        SERVICES.reduce((acc, s) => {
            acc[s.port] = { status: 'IDLE', time: '-', log: 'Waiting to start...' };
            return acc;
        }, {})
    );

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
                [port]: { status: 'IDLE', time: '-', log: 'Waiting to start...', message: '-' }
            }));
            setConsoleMsg(`Connecting to API for port ${port}...`);
        } else {
            const resetState = {};
            SERVICES.forEach(s => {
                resetState[s.port] = { status: 'IDLE', time: '-', log: 'Waiting to start...', message: '-' };
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
            setRetryDelay(2000);

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
            setConsoleMsg(`Connection error: ${err.message}`);
            setIsConnected(false);
            setIsMonitoring(false);
            // schedule reconnect with exponential backoff
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            const delay = Math.min(retryDelay, 60000);
            setConsoleMsg(`Disconnected. Retrying in ${Math.round(delay/1000)}s...`);
            reconnectTimerRef.current = setTimeout(() => {
                setRetryDelay(d => Math.min(60000, d * 2));
                startMonitoring(null, lastPortRef.current);
            }, delay);
        }
    };

    useEffect(() => {
        return () => {
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        };
    }, []);

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
                [data.port]: { status: 'RUNNING', message: 'Sending Message...', time: data.time, log: 'Checking docker logs...' }
            }));
        }
        else if (event === 'service_result') {
            setServiceState(prev => ({
                ...prev,
                [data.port]: { status: data.status, message: data.message, time: data.time || prev[data.port].time, log: data.detail || 'No detail available' }
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
                    
                    <form onSubmit={startMonitoring} className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Phone className="h-5 w-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                            </div>
                            <input 
                                type="text" 
                                value={targetNumber}
                                onChange={(e) => setTargetNumber(e.target.value)}
                                placeholder="Target Number" 
                                className="flex-1 w-full bg-slate-900/50 border border-slate-700/50 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all backdrop-blur-sm"
                            />
                        </div>
                            <button 
                            type="submit" 
                            disabled={isMonitoring}
                                className="self-start flex-none whitespace-nowrap flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-shadow shadow-sm disabled:opacity-60 disabled:shadow-none"
                        >
                            {isMonitoring ? (
                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Play className="w-5 h-5" />
                            )}
                            {isMonitoring ? 'Monitoring...' : 'Start Scan'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                // manual refresh UI
                                if (typeof window !== 'undefined') window.location.reload();
                            }}
                            className="self-start ml-2 hidden sm:inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium px-3 py-1.5 rounded-md transition-shadow shadow-sm"
                        >
                            Refresh UI
                        </button>
                    </form>

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

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
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
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
