const SERVICES = [
    { port: 8001, name: 'wa-api-bkk' },
    { port: 8002, name: 'wa-api-bapas' },
    { port: 8004, name: 'wa-api-smartdesaku' },
    { port: 8005, name: 'wa-api-gianyar' },
    { port: 8007, name: 'wa-api-bangli' },
    { port: 8009, name: 'wa-api-boyolali' },
    { port: 8010, name: 'wa-api-purwodadi' }
];

document.addEventListener('DOMContentLoaded', () => {
    initGrid();

    const form = document.getElementById('monitorForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        startMonitoring();
    });
});

function initGrid() {
    const grid = document.getElementById('servicesGrid');
    grid.innerHTML = '';
    
    SERVICES.forEach(service => {
        const card = document.createElement('div');
        card.className = 'service-card';
        card.id = `card-${service.port}`;
        
        card.innerHTML = `
            <div class="service-header">
                <div class="service-title">
                    <h3>${service.name}</h3>
                    <span class="service-port">${service.port}</span>
                </div>
                <span class="status-badge badge-idle" id="badge-${service.port}">IDLE</span>
            </div>
            <div class="service-details">
                <div class="detail-row">
                    <span class="detail-label">Status</span>
                    <span class="detail-value" id="status-${service.port}">-</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Time</span>
                    <span class="detail-value" id="time-${service.port}">-</span>
                </div>
            </div>
            <div class="service-log" id="log-${service.port}">
                Waiting to start...
            </div>
        `;
        
        grid.appendChild(card);
    });
}

function updateConsole(msg) {
    const consoleEl = document.getElementById('statusConsole');
    consoleEl.innerHTML = `<p class="console-text"><i class="fa-solid fa-terminal"></i> ${msg}</p>`;
}

async function startMonitoring() {
    const password = document.getElementById('sshPassword').value;
    const targetNumber = document.getElementById('targetNumber').value;
    const startBtn = document.getElementById('startBtn');
    
    if (!password) return;

    // Reset UI
    startBtn.disabled = true;
    startBtn.innerHTML = '<i class="fa-solid fa-circle-notch spinner"></i> Processing...';
    
    document.getElementById('successCount').textContent = '0';
    document.getElementById('failedCount').textContent = '0';
    document.getElementById('delayCount').textContent = '0';
    
    SERVICES.forEach(s => {
        document.getElementById(`card-${s.port}`).className = 'service-card';
        const badge = document.getElementById(`badge-${s.port}`);
        badge.className = 'status-badge badge-idle';
        badge.textContent = 'IDLE';
        document.getElementById(`status-${s.port}`).textContent = '-';
        document.getElementById(`time-${s.port}`).textContent = '-';
        document.getElementById(`log-${s.port}`).textContent = 'Waiting to start...';
    });

    updateConsole('Connecting to API...');

    try {
        const response = await fetch('/api/monitor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password, targetNumber })
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            
            let lines = buffer.split('\n\n');
            buffer = lines.pop(); // keep the last incomplete chunk in buffer

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
        updateConsole(`Connection error: ${err.message}`);
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Monitor';
    }
}

function handleEvent(event, data) {
    if (event === 'status') {
        updateConsole(data.message);
    } 
    else if (event === 'error') {
        updateConsole(data.message);
        document.getElementById('startBtn').disabled = false;
        document.getElementById('startBtn').innerHTML = '<i class="fa-solid fa-play"></i> Start Monitor';
    }
    else if (event === 'service_start') {
        const card = document.getElementById(`card-${data.port}`);
        card.className = 'service-card status-pending';
        
        const badge = document.getElementById(`badge-${data.port}`);
        badge.className = 'status-badge badge-pending';
        badge.innerHTML = '<i class="fa-solid fa-circle-notch spinner"></i> RUNNING';
        
        document.getElementById(`status-${data.port}`).textContent = 'Sending Message...';
        document.getElementById(`time-${data.port}`).textContent = data.time;
        document.getElementById(`log-${data.port}`).textContent = 'Checking docker logs...';
    }
    else if (event === 'service_result') {
        const card = document.getElementById(`card-${data.port}`);
        const badge = document.getElementById(`badge-${data.port}`);
        
        document.getElementById(`status-${data.port}`).textContent = data.message;
        if (data.time) document.getElementById(`time-${data.port}`).textContent = data.time;
        
        const logEl = document.getElementById(`log-${data.port}`);
        logEl.textContent = data.detail || 'No detail available';
        
        if (data.status === 'SUCCESS') {
            card.className = 'service-card status-success';
            badge.className = 'status-badge badge-success';
            badge.textContent = 'SUCCESS';
            document.getElementById('successCount').textContent = parseInt(document.getElementById('successCount').textContent) + 1;
        } 
        else if (data.status === 'FAILED') {
            card.className = 'service-card status-failed';
            badge.className = 'status-badge badge-failed';
            badge.textContent = 'FAILED';
            document.getElementById('failedCount').textContent = parseInt(document.getElementById('failedCount').textContent) + 1;
        } 
        else {
            card.className = 'service-card status-delay';
            badge.className = 'status-badge badge-delay';
            badge.textContent = 'DELAY';
            document.getElementById('delayCount').textContent = parseInt(document.getElementById('delayCount').textContent) + 1;
        }
    }
    else if (event === 'done') {
        updateConsole(`Monitoring selesai. Total: ${data.total}, Berhasil: ${data.successCount}, Gagal: ${data.failedCount}, Delay: ${data.delayCount}`);
        document.getElementById('startBtn').disabled = false;
        document.getElementById('startBtn').innerHTML = '<i class="fa-solid fa-play"></i> Start Monitor';
    }
}
