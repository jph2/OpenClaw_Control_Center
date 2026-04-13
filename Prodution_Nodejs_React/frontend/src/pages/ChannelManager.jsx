import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Upload, RefreshCw, Save, Check } from 'lucide-react';
import TelegramChat from '../components/TelegramChat';

// Constants have been moved to the Node.js backend.
// The UI acts purely as a consumer of configurations.

const ActiveBotsList = ({ chatId }) => {
    const { data: bots, isLoading } = useQuery({
        queryKey: ['activeBots', chatId],
        queryFn: async () => {
            const res = await fetch(`/api/telegram/bots/${chatId}`);
            if (!res.ok) return [];
            const data = await res.json();
            return data.bots || [];
        },
        staleTime: 60000
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            {isLoading && <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Checking bots...</div>}
            
            {bots && bots.map(bot => (
                <div key={bot.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#50e3c2' }}></div>
                    <span>{bot.first_name} {bot.username && `(@${bot.username})`}</span>
                </div>
            ))}
        </div>
    );
};

export default function ChannelManager() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('channels');
    
    // Sub-Task 1.4: Hot-Reloading via SSE from Backend
    useEffect(() => {
        const eventSource = new EventSource('/api/channels/events');
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'CONFIG_UPDATED') {
                    console.log('[SSE] Config cluster updated, invalidating React Query cache...');
                    queryClient.invalidateQueries({ queryKey: ['channels'] });
                }
            } catch (err) {}
        };
        return () => eventSource.close();
    }, [queryClient]);
    
    // Manage Channels Tab State
    const [rowSubtabs, setRowSubtabs] = useState({}); // { channelId: 'config' | 'chat' }
    
    // Bulk Selection State
    const [selectedChannels, setSelectedChannels] = useState([]);
    const [bulkModel, setBulkModel] = useState('');
    const [modelsLoaded, setModelsLoaded] = useState(false);
    
    // Custom height state for resizable rows
    const [rowHeights, setRowHeights] = useState(() => {
        const saved = localStorage.getItem('ag-channel-row-heights');
        return saved ? JSON.parse(saved) : {};
    });

    useEffect(() => {
        localStorage.setItem('ag-channel-row-heights', JSON.stringify(rowHeights));
    }, [rowHeights]);

    const [bulkSkill, setBulkSkill] = useState('');

    // Fetch live backend channels
    const { data: configData, isLoading, refetch } = useQuery({
        queryKey: ['channels'],
        queryFn: async () => {
            const res = await fetch('/api/channels');
            if (!res.ok) throw new Error('Failed to load channels');
            return res.json();
        }
    });

    const mutation = useMutation({
        mutationFn: async (payload) => {
            // Anti-Pattern 1 Fix: Ensure assignedAgent is undefined, not null
            if (payload.assignedAgent === null) payload.assignedAgent = undefined;
            const res = await fetch('/api/channels/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Update failed');
            return res.json();
        },
        onMutate: async (newChannel) => {
            await queryClient.cancelQueries({ queryKey: ['channels'] });
            const previousChannels = queryClient.getQueryData(['channels']);
            if (previousChannels?.data?.channels) {
                queryClient.setQueryData(['channels'], old => ({
                    ...old,
                    data: {
                        ...old.data,
                        channels: old.data.channels.map(c => c.id === newChannel.channelId ? { ...c, ...newChannel } : c)
                    }
                }));
            }
            return { previousChannels };
        },
        onError: (err, newChannel, context) => {
            if (context?.previousChannels) {
                queryClient.setQueryData(['channels'], context.previousChannels);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['channels'] });
        }
    });

    const backendChannels = configData?.data?.channels || [];

    const updateAgentMutation = useMutation({
        mutationFn: async (payload) => {
            const res = await fetch('/api/channels/updateAgent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Update failed');
            return res.json();
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['channels'] })
    });

    const updateSubAgentMutation = useMutation({
        mutationFn: async (payload) => {
            const res = await fetch('/api/channels/updateSubAgent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Update failed');
            return res.json();
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['channels'] })
    });

    const backendAgents = configData?.data?.agents || [];
    const backendSubAgents = configData?.data?.subAgents || [];
    
    // Dynamic Metadata (Data Integrity Phase 1)
    const activeMetadata = configData?.data?.metadata || { models: [], mainAgents: {}, subAgentsDict: {}, skills: {} };
    const AVAILABLE_MODELS = activeMetadata.models || [];
    const MAIN_AGENTS = activeMetadata.mainAgents || {};
    const SUB_AGENTS = activeMetadata.subAgentsDict || {};
    const SKILL_METADATA = activeMetadata.skills || {};

    const navigateToAgent = (agentId) => {
        setActiveTab('agents');
        setTimeout(() => {
            const el = document.getElementById(`agent-card-${agentId}`);
            if(el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.boxShadow = '0 0 0 2px #fff';
                setTimeout(() => el.style.boxShadow = 'none', 1500);
            }
        }, 100);
    };

    const handleUpdateChannel = (channelId, field, value) => {
        let channel = backendChannels.find(c => c.id === channelId) || { id: channelId };
        mutation.mutate({ ...channel, [field]: value, channelId: channelId });
    };

    
    const handleAddSkill = (channelId, skill) => {
        let channel = backendChannels.find(c => c.id === channelId) || { id: channelId, skills: [] };
        if (!channel.skills) channel.skills = [];
        if (!channel.skills.includes(skill)) {
            mutation.mutate({ ...channel, channelId, skills: [...channel.skills, skill] });
        }
    };

    const handleRemoveSkill = (channelId, skill) => {
        let channel = backendChannels.find(c => c.id === channelId);
        if (channel && channel.skills) {
            mutation.mutate({ ...channel, channelId, skills: channel.skills.filter(s => s !== skill) });
        }
    };
    
    const handleToggleSkill = (channelId, skill) => {
        let channel = backendChannels.find(c => c.id === channelId);
        if (channel) {
            let inactive = channel.inactiveSkills || [];
            if (inactive.includes(skill)) inactive = inactive.filter(s => s !== skill);
            else inactive = [...inactive, skill];
            mutation.mutate({ ...channel, channelId, inactiveSkills: inactive });
        }
    };
    
    const handleAddAgentSkill = (agentId, skill) => {
        let agent = backendAgents.find(a => a.id === agentId);
        if (agent) {
            let skills = agent.defaultSkills || [];
            if (!skills.includes(skill)) updateAgentMutation.mutate({ agentId, defaultSkills: [...skills, skill] });
        }
    };
    
    const handleRemoveAgentSkill = (agentId, skill) => {
        let agent = backendAgents.find(a => a.id === agentId);
        if (agent && agent.defaultSkills) {
            updateAgentMutation.mutate({ agentId, defaultSkills: agent.defaultSkills.filter(s => s !== skill) });
        }
    };

    const handleToggleAgentSkill = (agentId, skill) => {
        let agent = backendAgents.find(a => a.id === agentId);
        if (agent) {
            let inactive = agent.inactiveSkills || [];
            if (inactive.includes(skill)) inactive = inactive.filter(s => s !== skill);
            else inactive = [...inactive, skill];
            updateAgentMutation.mutate({ agentId, inactiveSkills: inactive });
        }
    };

    const handleAddSubAgentSkill = (subAgentId, skill) => {
        let sub = backendSubAgents.find(a => a.id === subAgentId);
        if (sub) {
            let skills = sub.additionalSkills || [];
            if (!skills.includes(skill)) updateSubAgentMutation.mutate({ subAgentId, additionalSkills: [...skills, skill] });
        }
    };
    
    const handleRemoveSubAgentSkill = (subAgentId, skill) => {
        let sub = backendSubAgents.find(a => a.id === subAgentId);
        if (sub && sub.additionalSkills) {
            updateSubAgentMutation.mutate({ subAgentId, additionalSkills: sub.additionalSkills.filter(s => s !== skill) });
        }
    };

    const handleToggleSubAgentSkill = (subAgentId, skill) => {
        let sub = backendSubAgents.find(a => a.id === subAgentId);
        if (sub) {
            let inactive = sub.inactiveSkills || [];
            if (inactive.includes(skill)) inactive = inactive.filter(s => s !== skill);
            else inactive = [...inactive, skill];
            updateSubAgentMutation.mutate({ subAgentId, inactiveSkills: inactive });
        }
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) setSelectedChannels(backendChannels.map(c => c.id));
        else setSelectedChannels([]);
    };

    const handleToggleSelect = (id) => {
        setSelectedChannels(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleApplyBulkModel = () => {
        if (!bulkModel || selectedChannels.length === 0) return;
        selectedChannels.forEach(id => handleUpdateChannel(id, 'model', bulkModel));
    };

    const handleAddBulkSkill = () => {
        if (!bulkSkill || selectedChannels.length === 0) return;
        selectedChannels.forEach(id => handleAddSkill(id, bulkSkill));
    };

    const handleSubAgentToggle = (channelId, subAgentId, currentInactiveArray) => {
        let newInactive;
        if (currentInactiveArray.includes(subAgentId)) {
            newInactive = currentInactiveArray.filter(id => id !== subAgentId);
        } else {
            newInactive = [...currentInactiveArray, subAgentId];
        }
        handleUpdateChannel(channelId, 'inactiveSubAgents', newInactive);
    };

    // Header Actions
    const handleExport = () => {
        window.location.href = '/api/channels/export';
    };

    const handleReload = async () => {
        await fetch('/api/channels/reload', { method: 'POST' });
        refetch();
    };

    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const json = JSON.parse(event.target.result);
                    const res = await fetch('/api/channels/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(json)
                    });
                    if (res.ok) {
                        alert('Configuration imported successfully!');
                        handleReload();
                    } else {
                        const err = await res.json();
                        alert(`Import failed: ${err.message || 'Validation error'}`);
                    }
                } catch (err) {
                    alert('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleSave = () => {
        // Since mutations auto-save to disk, this acts as a final sync check
        handleReload();
        alert('All configurations are persisted to sovereign storage.');
    };

    const renderManageChannels = () => (
        <>
            <div 
                style={{ 
                    display: 'flex', 
                    gap: '16px', 
                    alignItems: 'center', 
                    padding: '12px 16px', 
                    background: '#1a1b26', 
                    borderBottom: '1px solid var(--border-color)',
                    fontSize: '13px'
                }}
            >
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input type="text" placeholder="Search channels..." style={{ width: '180px', padding: '4px 8px', fontSize: '13px', background: '#13141c', border: '1px solid var(--border-color)', color: '#fff' }} />
                    <select style={{ width: '120px', padding: '4px 8px', fontSize: '13px', background: '#13141c', border: '1px solid var(--border-color)', color: '#fff' }}><option>All models</option></select>
                    <select style={{ width: '120px', padding: '4px 8px', fontSize: '13px', background: '#13141c', border: '1px solid var(--border-color)', color: '#fff' }}><option>All skills</option></select>
                    <button style={{ padding: '4px 12px', fontSize: '13px', whiteSpace: 'nowrap', cursor: 'pointer', background: '#2a2b36', border: '1px solid var(--border-color)', color: '#fff' }}>Reset</button>
                </div>
                
                <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 8px' }}></div>
                
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'nowrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selectedChannels.length === backendChannels.length && backendChannels.length > 0} onChange={handleSelectAll} style={{ cursor: 'pointer', transform: 'scale(1.2)' }} /> Select All ({selectedChannels.length})
                    </label>
                    <select value={bulkModel} onChange={e => setBulkModel(e.target.value)} style={{ width: '160px', padding: '4px 8px', fontSize: '13px', background: '#13141c', border: '1px solid var(--border-color)', color: '#fff' }}>
                        <option value="">Set model...</option>
                        {AVAILABLE_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <button onClick={handleApplyBulkModel} disabled={selectedChannels.length === 0} style={{ padding: '4px 12px', fontSize: '13px', whiteSpace: 'nowrap', cursor: selectedChannels.length === 0 ? 'not-allowed' : 'pointer', background: '#2a2b36', border: '1px solid var(--border-color)', color: '#fff', opacity: selectedChannels.length === 0 ? 0.5 : 1 }}>Apply</button>
                    
                    <select value={bulkSkill} onChange={e => setBulkSkill(e.target.value)} style={{ width: '160px', padding: '4px 8px', fontSize: '13px', background: '#13141c', border: '1px solid var(--border-color)', color: '#fff' }}>
                        <option value="">Add skill...</option>
                        {Object.keys(SKILL_METADATA).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={handleAddBulkSkill} disabled={selectedChannels.length === 0} style={{ padding: '4px 12px', fontSize: '13px', whiteSpace: 'nowrap', cursor: selectedChannels.length === 0 ? 'not-allowed' : 'pointer', background: '#2a2b36', border: '1px solid var(--border-color)', color: '#fff', opacity: selectedChannels.length === 0 ? 0.5 : 1 }}>Add</button>
                </div>
            </div>

            <table className="channel-table" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none' }}>
                <thead>
                    <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}><input type="checkbox" checked={selectedChannels.length === backendChannels.length && backendChannels.length > 0} onChange={handleSelectAll} style={{ cursor: 'pointer', transform: 'scale(1.2)' }} /></th>
                        <th style={{ width: '250px' }}>Telegram Group</th>
                        <th>Configuration & Chat Workspace</th>
                    </tr>
                </thead>
                <tbody>
                    {backendChannels.map(tg => {
                        const channelState = tg; // tg is already the merged backend object now
                        const assignedAgentKey = channelState.assignedAgent || 'tars';
                        const agentDetails = MAIN_AGENTS[assignedAgentKey] || MAIN_AGENTS.tars;
                        
                        // Calculating Skill Hierarchies
                        const activeSubAgents = backendSubAgents.filter(sub => sub.parent === assignedAgentKey && !(channelState.inactiveSubAgents || []).includes(sub.id));
                        const subAgentSkills = activeSubAgents.flatMap(sub => (sub.additionalSkills||[]).map(s => ({id: s, subId: sub.id})));
                        const agentSkills = agentDetails.defaultSkills || [];
                        
                        // De-duplicate skills
                        const allChannelSkills = [];
                        const seen = new Set();
                        
                        (channelState.skills || []).forEach(s => {
                            if (!seen.has(s)) { seen.add(s); allChannelSkills.push({ id: s, source: 'channel' }); }
                        });
                        
                        (agentSkills).forEach(s => {
                            if (!seen.has(s)) { seen.add(s); allChannelSkills.push({ id: s, source: 'agent' }); }
                        });
                        
                        subAgentSkills.forEach(s => {
                            if (!seen.has(s.id)) { seen.add(s.id); allChannelSkills.push({ id: s.id, source: 'sub', subId: s.subId }); }
                        });
                        
                        const subTab = rowSubtabs[tg.id] || 'config';

                        return (
                            <tr key={tg.id} style={{ borderBottom: '3px solid rgba(255, 255, 255, 0.1)', background: selectedChannels.includes(tg.id) ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
                                <td style={{ borderLeft: `2px solid ${agentDetails.color || 'transparent'}`, width: '40px', textAlign: 'center' }}>
                                    <input type="checkbox" checked={selectedChannels.includes(tg.id)} onChange={() => handleToggleSelect(tg.id)} style={{ cursor: 'pointer', transform: 'scale(1.2)' }} />
                                </td>
                                
                                <td style={{ width: '250px' }}>
                                    <div className="tg-group">
                                        <div className="tg-name">{tg.name}</div>
                                        <div className="tg-id">{tg.id}</div>
                                        <div className={`status-badge ${tg.status}`} style={{ width: 'fit-content', marginTop: '8px' }}>
                                            <div className="status-dot"></div> {tg.status}
                                        </div>
                                        <div className="current-task" style={{ marginBottom: '16px' }}>{tg.currentTask}</div>
                                        
                                        <select 
                                            value={channelState.assignedAgent || ''} 
                                            onChange={(e) => handleUpdateChannel(tg.id, 'assignedAgent', e.target.value)}
                                            style={{ width: '100%', marginBottom: '8px' }}
                                        >
                                            <option value="">No Agent</option>
                                            <option value="tars">TARS</option>
                                            <option value="marvin">MARVIN</option>
                                            <option value="sonic">SONIC</option>
                                        </select>
                                        {channelState.assignedAgent && (
                                            <div 
                                                onClick={() => navigateToAgent(channelState.assignedAgent)}
                                                style={{ fontSize: '10px', color: agentDetails.color, cursor: 'pointer', textDecoration: 'underline', marginBottom: '16px', display: 'inline-block' }}
                                            >
                                                Configure {agentDetails.name} ➔
                                            </div>
                                        )}

                                        <div style={{ marginTop: '8px', marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                            ACTIVE MEMBERS
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-primary)' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: channelState.assignedAgent ? agentDetails.color : 'red' }}></div>
                                                <span>{channelState.assignedAgent ? `${agentDetails.name} (Engine)` : 'No Agent (Dormant)'}</span>
                                            </div>
                                            
                                            {/* Sub-Agents properly nested under the Engine */}
                                            {Object.entries(SUB_AGENTS).filter(([_, sub]) => sub.parent === assignedAgentKey).map(([subId, sub]) => {
                                                const isSubActive = !(channelState.inactiveSubAgents || []).includes(subId);
                                                return (
                                                    <div key={subId} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginLeft: '14px', marginTop: '2px' }}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={isSubActive}
                                                            onChange={() => handleSubAgentToggle(tg.id, subId, channelState.inactiveSubAgents || [])}
                                                            style={{ cursor: 'pointer', margin: 0 }}
                                                        /> 
                                                        <span 
                                                            onClick={(e) => { e.preventDefault(); navigateToAgent(subId); }}
                                                            style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}
                                                        >
                                                            {sub.name}
                                                        </span>
                                                        <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', opacity: 0.6 }}>+{sub.additionalSkills.length} skills</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Dynamic Bots via Telegram API */}
                                        <ActiveBotsList chatId={tg.id} />
                                    </div>
                                </td>

                                
                                <td style={{ padding: 0 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', height: `${rowHeights[tg.id] || 450}px`, borderLeft: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                        <div className="row-tabs" style={{ flexShrink: 0 }}>
                                            <button 
                                                className={`row-tab ${subTab === 'config' ? 'active' : ''}`}
                                                onClick={() => setRowSubtabs({...rowSubtabs, [tg.id]: 'config'})}
                                            >⚙️ Configuration</button>
                                            <button 
                                                className={`row-tab ${subTab === 'chat' ? 'active' : ''}`}
                                                onClick={() => setRowSubtabs({...rowSubtabs, [tg.id]: 'chat'})}
                                            >💬 Chat</button>
                                        </div>
                                        
                                        {subTab === 'config' && (
                                            <div style={{ display: 'flex', padding: '16px', gap: '20px' }}>
                                                
                                                {/* Vertical Skills List */}
                                                <div className="skills-cell" style={{ flex: 1 }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>SKILLS</div>
                                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                                                        {allChannelSkills.length} SKILLS (DEFAULT: {agentSkills.length}, SUB: {subAgentSkills.length}, ADDED: {(channelState.skills || []).length})
                                                    </div>
                                                    
                                                    <div className="skills-list">
                                                        {allChannelSkills.map(skill => {
                                                            let badge = "CHANNEL SKILL";
                                                            if(skill.source === 'agent') badge = "INHERITED BY AGENT";
                                                            if(skill.source === 'sub') badge = "INHERITED BY SUB-AGENT";
                                                            
                                                            const isChannelSkill = skill.source === 'channel';
                                                            
                                                            // Check if inactive based on source
                                                            let isInactive = false;
                                                            if (skill.source === 'channel') {
                                                                isInactive = (channelState.inactiveSkills || []).includes(skill.id);
                                                            } else if (skill.source === 'agent') {
                                                                let ag = backendAgents.find(a => a.id === channelState.assignedAgent);
                                                                if (ag && (ag.inactiveSkills || []).includes(skill.id)) isInactive = true;
                                                            } else if (skill.source === 'sub') {
                                                                let sub = backendSubAgents.find(s => s.id === skill.subId);
                                                                if (sub && (sub.inactiveSkills || []).includes(skill.id)) isInactive = true;
                                                            }

                                                            return (
                                                                <div key={skill.id + skill.source} className={`skill-item ${!isInactive ? 'active' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr auto auto', alignItems: 'center', gap: '12px', width: '100%' }}>
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={!isInactive} 
                                                                        onChange={() => {
                                                                            if(skill.source === 'channel') handleToggleSkill(tg.id, skill.id);
                                                                            else if(skill.source === 'agent') handleToggleAgentSkill(channelState.assignedAgent, skill.id);
                                                                            else if(skill.source === 'sub') handleToggleSubAgentSkill(skill.subId, skill.id);
                                                                        }} 
                                                                        style={{ flexShrink: 0, margin: 0 }}
                                                                    />
                                                                    <span className="skill-name" style={{ whiteSpace: 'nowrap' }}>{skill.id}</span>
                                                                    <span className="skill-separator" style={{ color: 'var(--text-secondary)' }}>|</span>
                                                                    <span className="skill-desc" style={{ lineHeight: '1.4', paddingRight: '12px', minWidth: 0 }}>{SKILL_METADATA[skill.id]?.desc || ""}</span>
                                                                    <span style={{ fontSize: '9px', color: isChannelSkill ? 'var(--text-secondary)' : agentDetails.color, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{badge}</span>
                                                                    {isChannelSkill ? (
                                                                        <button 
                                                                            onClick={() => handleRemoveSkill(tg.id, skill.id)}
                                                                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 4px', justifySelf: 'end' }}
                                                                        >
                                                                            x
                                                                        </button>
                                                                    ) : <div />}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                    
                                                    <select 
                                                        onChange={(e) => {
                                                            if (e.target.value) { handleAddSkill(tg.id, e.target.value); e.target.value = ""; }
                                                        }}
                                                        style={{ width: '100%', marginTop: '8px' }}
                                                    >
                                                        <option value="">Add channel skill...</option>
                                                        {Object.keys(SKILL_METADATA).map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                </div>
                                                
                                                {/* Model Radio List */}
                                                <div className="model-cell" style={{ width: '250px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>MODEL SETTINGS</div>


                                                    <div className="model-list">
                                                        {AVAILABLE_MODELS.map(model => (
                                                            <label key={model.id} className={`model-item ${channelState.model === model.id ? 'active' : ''}`}>
                                                                <input 
                                                                    type="radio" 
                                                                    name={`model-${tg.id}`}
                                                                    checked={channelState.model === model.id}
                                                                    onChange={() => handleUpdateChannel(tg.id, 'model', model.id)}
                                                                />
                                                                <div className="model-content">
                                                                    <span className="model-name">{model.name}</span>
                                                                    <span className="model-separator">|</span>
                                                                    <span className="model-desc" style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.desc}</span>
                                                                </div>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>

                                            </div>
                                        )}
                                        {subTab === 'chat' && (
                                            <div style={{ flex: 1, width: '100%', overflow: 'hidden' }}>
                                                <TelegramChat channelId={tg.id} channelName={tg.name} />
                                            </div>
                                        )}
                                    </div>
                                    <div 
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            const startY = e.clientY;
                                            const startH = rowHeights[tg.id] || 450;
                                            const onMove = (me) => setRowHeights(prev => ({...prev, [tg.id]: Math.max(200, startH + (me.clientY - startY))}));
                                            const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
                                            document.addEventListener('mousemove', onMove);
                                            document.addEventListener('mouseup', onUp);
                                        }}
                                        style={{ 
                                            width: '100%', height: '8px', cursor: 'row-resize', 
                                            background: 'var(--border-color)', 
                                            borderBottom: '1px solid #111',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                                            transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = '#444'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--border-color)'}
                                    >
                                        <div style={{ width: '30px', height: '4px', background: 'var(--text-secondary)', borderRadius: '2px' }} />
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </>
    );

    
    const renderSkillsTab = () => (
        <div style={{ padding: '24px 0' }}>
            <h2 style={{ marginBottom: '24px' }}>Available Skills</h2>
            <div style={{ display: 'grid', gap: '16px' }}>
                {Object.entries(SKILL_METADATA).map(([id, skill]) => {
                    let colorCode = '#50e3c2'; // BUNDLED
                    if (skill.src === 'managed') colorCode = '#e3c450';
                    if (skill.src === 'custom' || skill.src === 'modified') colorCode = '#e35050';

                    return (
                        <div key={id} className="skill-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: `4px solid ${colorCode}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <h3 style={{ margin: 0, color: colorCode }}>{id}</h3>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <span className="status-badge active" style={{ borderColor: colorCode, color: colorCode }}>{skill.src.toUpperCase()}</span>
                                    {skill.def && <span className="status-badge planning" style={{ borderColor: colorCode, color: colorCode }}>DEFAULT</span>}
                                </div>
                            </div>
                            <div style={{ display: 'flex' }}>
                                <div style={{ flex: 1 }}>
                                    <p style={{ margin: '0 0 12px 0', color: 'var(--text-primary)' }}>{skill.desc}</p>
                                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                        <span style={{ marginRight: '16px' }}>Origin: <span style={{color:'var(--text-primary)'}}>{skill.origin}</span></span>
                                        <span>Category: <span style={{color:'var(--text-primary)'}}>{skill.cat}</span></span>
                                    </div>
                                </div>
                                <div style={{ flex: 1, borderLeft: '1px solid var(--border-color)', paddingLeft: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                    
                                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                        {id === 'weather' && "Fetches real-time meteorological data, forecasts, and historical trends for given coordinates or city names."}
                                        {id === 'web_search' && "Utilizes Google Search API for robust data grounding. Highly effective for breaking news, fact-checking, and general knowledge expansion beyond the model's training cutoff."}
                                        {id === 'notion' && "Bi-directional sync with Notion workspaces. Create pages, update databases, and query knowledge bases. Ideal for structured documentation."}
                                        {id === 'omniverse-extension-development' && "Deep integration with NVIDIA Omniverse. Can scaffold extensions, write Python UI scripts, and interface with the Kit SDK."}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div className="tg-id" style={{ marginTop: '0', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px' }}>
                                            {id === 'omniverse-extension-development' ? `/home/claw-agentbox/.openclaw/workspace/skills/${id}` : `/home/claw-agentbox/.npm-global/lib/node_modules/openclaw/skills/${id}`}
                                        </div>
                                        {skill.src === 'managed' && (
                                            <button style={{ background: '#2a2b36', border: '1px solid var(--border-color)', color: '#fff', padding: '2px 8px', fontSize: '10px', height: 'fit-content' }}>Open Web Source</button>
                                        )}
                                        {(skill.src === 'custom' || skill.src === 'modified') && (
                                            <button style={{ background: '#2a2b36', border: '1px solid var(--border-color)', color: '#fff', padding: '2px 8px', fontSize: '10px', height: 'fit-content' }}>Open in Workbench</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );


    
    const renderAgentsTab = () => (
        <div style={{ padding: '24px 0' }}>
            <h2 style={{ marginBottom: '24px' }}>Main Agents</h2>
            <div style={{ display: 'grid', gap: '16px', marginBottom: '40px' }}>
                {backendAgents.map(agent => (
                    <div key={agent.id} id={`agent-card-${agent.id}`} className="agent-card main" style={{ borderColor: agent.color, transition: 'box-shadow 0.3s' }}>
                        <h3 style={{ color: agent.color }}>{agent.name}</h3>
                        <div className="agent-role" style={{ color: agent.color, marginBottom: '8px' }}>{agent.role}</div>
                        
                        <div style={{ background: 'var(--bg-elevated)', padding: '12px', borderRadius: '6px', fontStyle: 'italic', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            "{agent.description || "Direct, honest, useful."}"
                        </div>
                        
                        <div style={{ fontSize: '11px', color: agent.color, marginBottom: '8px' }}>Default Skills: {(agent.defaultSkills||[]).length} skills</div>
                        {(agent.defaultSkills||[]).map(s => {
                            const isInactive = (agent.inactiveSkills || []).includes(s);
                            return (
                                <div key={s} className={`skill-item ${!isInactive ? 'active' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr auto', alignItems: 'center', gap: '12px', width: '100%' }}>
                                    <input 
                                        type="checkbox" 
                                        checked={!isInactive} 
                                        onChange={() => handleToggleAgentSkill(agent.id, s)}
                                        style={{ flexShrink: 0, margin: 0 }}
                                    />
                                    <span className="skill-name" style={{ whiteSpace: 'nowrap' }}>{s}</span>
                                    <span className="skill-separator" style={{ color: 'var(--text-secondary)' }}>|</span>
                                    <span className="skill-desc" style={{ lineHeight: '1.4', paddingRight: '16px', minWidth: 0 }}>{SKILL_METADATA[s]?.desc}</span>
                                    <button 
                                        onClick={() => handleRemoveAgentSkill(agent.id, s)}
                                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 8px', justifySelf: 'end' }}
                                    >x</button>
                                </div>
                            );
                        })}
                        <select 
                            onChange={(e) => { if (e.target.value) { handleAddAgentSkill(agent.id, e.target.value); e.target.value = ""; } }}
                            style={{ width: '100%', marginTop: '8px', padding: '6px 8px', background: '#13141c', outline: 'none', border: 'none', color: 'var(--text-secondary)' }}
                        >
                            <option value="">+ Add skill...</option>
                            {Object.keys(SKILL_METADATA).map(s => <option key={s} value={s}>{s} {SKILL_METADATA[s]?.desc ? `| ${SKILL_METADATA[s].desc}` : ''}</option>)}
                        </select>
                    </div>
                ))}
            </div>

            <h2 style={{ marginBottom: '24px' }}>Sub-Agents</h2>
            <div style={{ display: 'grid', gap: '16px' }}>
                {backendSubAgents.map(sub => {
                    const parentColor = backendAgents.find(a => a.id === sub.parent)?.color || '#50e3c2';
                    return (
                        <div key={sub.id} id={`agent-card-${sub.id}`} className="agent-card main" style={{ borderColor: parentColor, transition: 'box-shadow 0.3s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ color: parentColor, margin: 0 }}>{sub.name}</h3>
                                <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                    {sub.parent}
                                </span>
                            </div>
                            
                            <div style={{ color: 'var(--text-secondary)', margin: '8px 0 16px 0', fontSize: '14px' }}>
                                {sub.description || "Web search and information gathering"}
                            </div>
                            
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Additional Skills: {(sub.additionalSkills||[]).length} skills</div>
                            {(sub.additionalSkills||[]).map(s => {
                                const isInactive = (sub.inactiveSkills || []).includes(s);
                                return (
                                    <div key={s} className={`skill-item ${!isInactive ? 'active' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr auto', alignItems: 'center', gap: '12px', width: '100%' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={!isInactive} 
                                            onChange={() => handleToggleSubAgentSkill(sub.id, s)}
                                            style={{ flexShrink: 0, margin: 0 }}
                                        />
                                        <span className="skill-name" style={{ whiteSpace: 'nowrap' }}>{s}</span>
                                        <span className="skill-separator" style={{ color: 'var(--text-secondary)' }}>|</span>
                                        <span className="skill-desc" style={{ lineHeight: '1.4', paddingRight: '16px', minWidth: 0 }}>{SKILL_METADATA[s]?.desc}</span>
                                        <button 
                                            onClick={() => handleRemoveSubAgentSkill(sub.id, s)}
                                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 8px', justifySelf: 'end' }}
                                        >x</button>
                                    </div>
                                );
                            })}
                            <select 
                                onChange={(e) => { if (e.target.value) { handleAddSubAgentSkill(sub.id, e.target.value); e.target.value = ""; } }}
                                style={{ width: '100%', marginTop: '8px', padding: '6px 8px', background: '#13141c', outline: 'none', border: 'none', color: 'var(--text-secondary)' }}
                            >
                                <option value="">+ Add skill...</option>
                                {Object.keys(SKILL_METADATA).map(s => <option key={s} value={s}>{s} {SKILL_METADATA[s]?.desc ? `| ${SKILL_METADATA[s].desc}` : ''}</option>)}
                            </select>
                        </div>
                    );
                })}
            </div>
        </div>
    );


    return (
        <div style={{ minHeight: '100vh', padding: '0', display: 'flex', flexDirection: 'column' }}>
            
            {/* STICKY HEADER */}
            <header style={{ 
                padding: '20px 24px', 
                margin: 0, 
                position: 'sticky', top: 0, 
                background: 'var(--bg-primary)', 
                borderBottom: '1px solid var(--border-color)', 
                zIndex: 100,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.4rem' }}>
                        📺 Channel Manager
                    </h1>
                    <div className="tabs" style={{ marginTop: '4px' }}>
                        <button className={`tab ${activeTab === 'channels' ? 'active' : ''}`} onClick={() => setActiveTab('channels')}>Manage Channels</button>
                        <button className={`tab ${activeTab === 'agents' ? 'active' : ''}`} onClick={() => setActiveTab('agents')}>Agents</button>
                        <button className={`tab ${activeTab === 'skills' ? 'active' : ''}`} onClick={() => setActiveTab('skills')}>Skills</button>
                    </div>
                </div>

                <div className="header-actions">
                    <button onClick={handleExport}><Download size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> Export</button>
                    <button onClick={handleImport}><Upload size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> Import</button>
                    <button onClick={handleReload}><RefreshCw size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> Reload</button>
                    <button className="primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Save size={16} /> Save
                    </button>
                </div>
            </header>

            {isLoading && <div style={{ padding: '40px', color: 'var(--text-secondary)' }}>Loading telemetry...</div>}

            {/* SCROLLING MAIN VIEWPORT */}
            {!isLoading && (
                <main style={{ padding: '0 24px', flex: 1, overflowY: 'auto' }}>
                    {activeTab === 'channels' && renderManageChannels()}
                    {activeTab === 'skills' && renderSkillsTab()}
                    {activeTab === 'agents' && renderAgentsTab()}
                </main>
            )}
            
        </div>
    );
}
