import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORTS = {
    BACKEND: 3000,
    WORKBENCH: 4260,
    FRONTEND: 5173
};

const SERVICES = [
    {
        name: 'Backend (Channel Manager)',
        port: PORTS.BACKEND,
        cwd: path.join(__dirname, 'Prodution_Nodejs_React', 'backend'),
        command: 'npm',
        args: ['run', 'dev']
    },
    {
        name: 'Frontend (Vite UI)',
        port: PORTS.FRONTEND,
        cwd: path.join(__dirname, 'Prodution_Nodejs_React', 'frontend'),
        command: 'npm',
        args: ['run', 'dev']
    },
    {
        name: 'Workbench (Root)',
        port: PORTS.WORKBENCH,
        cwd: __dirname,
        command: 'npm',
        args: ['run', 'dev']
    }
];

async function getPID(port) {
    try {
        const { stdout } = await execAsync(`lsof -t -i:${port}`);
        return stdout.trim().split('\n').filter(Boolean);
    } catch {
        return [];
    }
}

async function status() {
    console.log('\n--- OpenClaw Control Center Status ---');
    for (const service of SERVICES) {
        const pids = await getPID(service.port);
        const isRunning = pids.length > 0;
        console.log(`${isRunning ? '✅' : '❌'} ${service.name.padEnd(25)} | Port: ${service.port} | PIDs: ${isRunning ? pids.join(', ') : 'None'}`);
    }
    console.log('-------------------------------\n');
}

async function stop() {
    console.log('\nStopping all services...');
    const allPorts = Object.values(PORTS);
    for (const port of allPorts) {
        const pids = await getPID(port);
        if (pids.length > 0) {
            console.log(`Killing PIDs ${pids.join(', ')} on port ${port}...`);
            await execAsync(`kill -9 ${pids.join(' ')}`);
        }
    }
    console.log('Environment cleaned.\n');
}

async function start() {
    await status();
    
    for (const service of SERVICES) {
        const pids = await getPID(service.port);
        if (pids.length > 0) {
            console.log(`Service "${service.name}" is already running on port ${service.port}. Skipping.`);
            continue;
        }

        console.log(`Starting "${service.name}"...`);
        const child = spawn(service.command, service.args, {
            cwd: service.cwd,
            detached: true,
            stdio: 'ignore' // We run in background for lightweight assurance
        });
        
        child.unref();
        console.log(`Service "${service.name}" spawned in background.`);
    }
    
    console.log('\nAll services triggered. Please wait a few seconds for initialization.');
    console.log('Access URLs:');
    console.log(`- Workbench: http://localhost:${PORTS.WORKBENCH}`);
    console.log(`- UI Manager: http://localhost:${PORTS.FRONTEND}`);
    console.log(`- Backend API: http://localhost:${PORTS.BACKEND}/api/health\n`);
}

const arg = process.argv[2];

if (arg === 'status') {
    status();
} else if (arg === 'stop') {
    stop();
} else if (arg === 'start') {
    start();
} else if (arg === 'restart') {
    await stop();
    await start();
} else {
    console.log('Usage: node surface-ctl.mjs [status|start|stop|restart]');
}
