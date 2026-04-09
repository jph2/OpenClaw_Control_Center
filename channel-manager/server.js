const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.CHANNEL_MANAGER_PORT || 3401;
const CONFIG_PATH = path.join(__dirname, 'channel_config.json');
const OPENCLAW_CONFIG = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const SKILLS_DIRS = [
    path.join(os.homedir(), '.openclaw', 'skills'),
    '/usr/lib/node_modules/openclaw/skills'
];

// MIME types
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Read OpenClaw config
function readOpenClawConfig() {
    try {
        const data = fs.readFileSync(OPENCLAW_CONFIG, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Failed to read openclaw.json:', e.message);
        return { agents: [] };
    }
}

// Read channel config
function readChannelConfig() {
    try {
        const data = fs.readFileSync(CONFIG_PATH, 'utf8');
        return JSON.parse(data);
    } catch (e) {
        console.log('No existing config, using defaults');
        return {
            channels: [
                {
                    id: "-5207805052",
                    name: "TL000 General Chat",
                    model: "local-pc/google/gemma-4-26b-a4b",
                    skills: ["weather", "web_search"],
                    require_mention: false
                },
                {
                    id: "-5272630186",
                    name: "TL500 OpenClaw Governance",
                    model: "local-pc/google/gemma-4-26b-a4b",
                    skills: ["healthcheck", "node-connect"],
                    require_mention: false
                },
                {
                    id: "-3510007915",
                    name: "TL020 omniUSD",
                    model: "moonshot/kimi-k2.5",
                    skills: ["omniverse-extension-development", "usd-development"],
                    require_mention: false
                }
            ]
        };
    }
}

// Scan skills directories
function scanSkills() {
    const skills = new Map();
    
    for (const dir of SKILLS_DIRS) {
        if (!fs.existsSync(dir)) continue;
        
        try {
            const entries = fs.readdirSync(dir);
            for (const entry of entries) {
                const skillPath = path.join(dir, entry);
                const stat = fs.statSync(skillPath);
                
                if (stat.isDirectory()) {
                    const skillMdPath = path.join(skillPath, 'SKILL.md');
                    if (fs.existsSync(skillMdPath)) {
                        const content = fs.readFileSync(skillMdPath, 'utf8');
                        const name = parseSkillName(content) || entry;
                        const description = parseSkillDescription(content);
                        
                        if (!skills.has(name)) {
                            skills.set(name, {
                                name,
                                description,
                                path: skillPath
                            });
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`Failed to scan ${dir}:`, e.message);
        }
    }
    
    return Array.from(skills.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Parse skill name from YAML frontmatter
function parseSkillName(content) {
    const match = content.match(/^name:\s*(.+)$/m);
    return match ? match[1].trim() : null;
}

// Parse skill description from YAML frontmatter
function parseSkillDescription(content) {
    const match = content.match(/^description:\s*(.+)$/m);
    return match ? match[1].trim() : 'No description';
}

// Read skill content
function readSkillContent(skillName) {
    const skills = scanSkills();
    const skill = skills.find(s => s.name === skillName);
    
    if (!skill) {
        return null;
    }
    
    try {
        const content = fs.readFileSync(path.join(skill.path, 'SKILL.md'), 'utf8');
        const files = fs.readdirSync(skill.path);
        
        return {
            name: skill.name,
            content,
            files
        };
    } catch (e) {
        return null;
    }
}

// Build skill tree data
function buildSkillTree() {
    const config = readChannelConfig();
    const skills = scanSkills();
    
    const agents = config.channels.map((channel, index) => ({
        id: channel.id,
        name: channel.name,
        emoji: '🦞',
        color: getColor(index),
        skills: channel.skills || [],
        model: channel.model,
        require_mention: channel.require_mention
    }));
    
    // Build skill usage map
    const skillUsage = new Map();
    for (const agent of agents) {
        for (const skill of agent.skills) {
            if (!skillUsage.has(skill)) {
                skillUsage.set(skill, []);
            }
            skillUsage.get(skill).push(agent.id);
        }
    }
    
    const skillNodes = skills.map(skill => ({
        id: `skill-${skill.name}`,
        name: skill.name,
        description: skill.description,
        agents: skillUsage.get(skill.name) || []
    }));
    
    return { agents, skills: skillNodes };
}

function getColor(index) {
    const colors = ['#50e3c2', '#e35050', '#e3c450', '#5080e3', '#e350a8', '#50e350', '#c450e3', '#50c8e3'];
    return colors[index % colors.length];
}

// HTTP Server
const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // API Routes
    if (pathname === '/api/config') {
        if (req.method === 'GET') {
            const config = readChannelConfig();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(config));
        } else if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const config = JSON.parse(body);
                    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        }
        return;
    }
    
    if (pathname === '/api/skills') {
        const skills = scanSkills();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(skills));
        return;
    }
    
    if (pathname === '/api/skill-tree') {
        const tree = buildSkillTree();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(tree));
        return;
    }
    
    if (pathname.startsWith('/api/skills/')) {
        const skillName = decodeURIComponent(pathname.replace('/api/skills/', ''));
        const skillData = readSkillContent(skillName);
        
        if (skillData) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(skillData));
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Skill not found' }));
        }
        return;
    }
    
    if (pathname === '/api/save-config' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const config = JSON.parse(body);
                fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }
    
    // Static Files
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, filePath);
    
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Server Error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`Channel Manager running at http://127.0.0.1:${PORT}`);
    console.log(`Config path: ${CONFIG_PATH}`);
    
    const skills = scanSkills();
    console.log(`Found ${skills.length} skills`);
    
    const config = readChannelConfig();
    console.log(`Loaded ${config.channels.length} channels`);
});
