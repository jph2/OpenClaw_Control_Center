import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, useIsMutating } from '@tanstack/react-query';
import { Download, Upload, RefreshCw, Save, Check, ChevronUp, ChevronDown, Plus, X, FileJson2 } from 'lucide-react';
import ChannelManagerChannelRow from '../components/ChannelManagerChannelRow';
import OpenClawApplyModal from '../components/OpenClawApplyModal.jsx';
import TelegramAccountPolicyPanel from '../components/TelegramAccountPolicyPanel.jsx';
import { DEFAULT_TELEGRAM_ACCOUNT_POLICY } from '../utils/defaultTelegramAccountPolicy.js';
import OpenclawAgentsDefaultsPolicyPanel from '../components/OpenclawAgentsDefaultsPolicyPanel.jsx';
import { DEFAULT_OPENCLAW_AGENTS_DEFAULTS_POLICY } from '../utils/defaultOpenclawAgentsDefaultsPolicy.js';
import { useWorkbenchStore } from './Workbench.jsx';
import { formatSkillOptionLabel } from '../utils/formatSkillOptionLabel.js';
import { sortTtgChannels } from '../utils/sortTtgChannels.js';
import { apiUrl } from '../utils/apiUrl.js';

// Constants have been moved to the Node.js backend.
// The UI acts purely as a consumer of configurations.

const SKILL_LIST_FILTER_INITIAL = { q: '', cat: '', src: '', defOnly: false, sort: 'name-asc' };

/** Bulk row heights for Manage Channels (4K single-segment layout). */
const ROW_HEIGHT_COLLAPSED = 260;
/** Expanded height for bulk “all” actions (tuned for ~one viewport segment on 4K; was 1760 → 1460 → 1160 → 1010). */
const ROW_HEIGHT_EXPANDED = 1010;

/** Shared key so we can block “Apply to OpenClaw” while config writes are in flight. */
const CM_PERSIST_MUTATION_KEY = ['channel-manager-persist'];

const APPLY_OPENCLAW_TITLE_WITH_TG_ACCOUNT =
    'Apply merges into openclaw.json (preview, backup, then gateway restart): per TTG requireMention/skills, synth agents (agents.list), bindings — plus Telegram bot admission (groupPolicy, dmPolicy, allowFrom, groupAllowFrom), because “On next Apply…” in Bot admission (Telegram) is checked.';

const APPLY_OPENCLAW_TITLE_WITHOUT_TG_ACCOUNT =
    'Apply still writes TTG fields, synth agents, and bindings to openclaw.json. Without “On next Apply…” in Bot admission (Telegram), only the four account keys (groupPolicy, dmPolicy, allowFrom, groupAllowFrom) are not merged into the gateway — everything else is. To include admission: enable the checkbox, save, then Apply.';

const BULK_SELECTION_TOOLTIP =
    'Select TTGs here to apply bulk changes from this toolbar, such as setting one model or adding one skill to every selected channel.';

const APPLY_PREVIEW_QUERY_KEY = ['openclaw-apply-preview-status'];
const APPLY_DIRTY_STORAGE_KEY = 'channel-manager-apply-openclaw-dirty';
const APPLY_BASELINE_STORAGE_KEY = 'channel-manager-apply-openclaw-baseline';

const bulkTooltipStyle = { top: 'calc(var(--tooltip-y, 0px) - 8px)', left: 'var(--tooltip-x, 0px)' };

function setBulkTooltipPosition(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--tooltip-x', `${Math.max(12, rect.left)}px`);
    e.currentTarget.style.setProperty('--tooltip-y', `${rect.top}px`);
}

function buildApplyBaselineSignature(configData) {
    const data = configData?.data;
    if (!configData?.ok || !data) return '';
    const sortById = (items) =>
        [...(Array.isArray(items) ? items : [])].sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || '')));
    const pickChannel = (c) => ({
        id: c.id,
        name: c.name,
        assignedAgent: c.assignedAgent,
        model: c.model,
        skills: c.skills || [],
        inactiveSubAgents: c.inactiveSubAgents || [],
        inactiveSkills: c.inactiveSkills || [],
        caseSkills: c.caseSkills || [],
        inactiveCaseSkills: c.inactiveCaseSkills || [],
        require_mention: c.require_mention
    });
    const pickAgent = (a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        defaultSkills: a.defaultSkills || [],
        inactiveSkills: a.inactiveSkills || []
    });
    const pickSubAgent = (a) => ({
        id: a.id,
        name: a.name,
        parent: a.parent,
        additionalSkills: a.additionalSkills || [],
        inactiveSkills: a.inactiveSkills || [],
        enabled: a.enabled
    });
    return JSON.stringify({
        channels: sortById(data.channels).map(pickChannel),
        agents: sortById(data.agents).map(pickAgent),
        subAgents: sortById(data.subAgents).map(pickSubAgent),
        telegramAccountPolicy: data.telegramAccountPolicy || null,
        openclawAgentsDefaultsPolicy: data.openclawAgentsDefaultsPolicy || null
    });
}

export default function ChannelManager() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('channels');
    const [openClawApplyOpen, setOpenClawApplyOpen] = useState(false);
    const [applyDirty, setApplyDirty] = useState(() => localStorage.getItem(APPLY_DIRTY_STORAGE_KEY) === '1');
    const cleanApplySignatureRef = useRef(localStorage.getItem(APPLY_BASELINE_STORAGE_KEY) || '');

    const channelPersistInFlight = useIsMutating({ mutationKey: CM_PERSIST_MUTATION_KEY }) > 0;

    /** Before Apply preview/write: align UI with server; disk is already updated when mutations settled. */
    const prepareApplyToOpenClaw = useCallback(async () => {
        await queryClient.refetchQueries({ queryKey: ['channels'] });
    }, [queryClient]);
    
    // Sub-Task 1.4: Hot-Reloading via SSE from Backend
    useEffect(() => {
        const eventSource = new EventSource(apiUrl('/api/channels/events'));
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

    /** Create sub-agent modal (Agents tab) */
    const [createSubAgentOpen, setCreateSubAgentOpen] = useState(false);
    const [newSubAgentId, setNewSubAgentId] = useState('');
    const [newSubAgentName, setNewSubAgentName] = useState('');
    const [newSubAgentDescription, setNewSubAgentDescription] = useState('');
    const [newSubAgentParent, setNewSubAgentParent] = useState('tars');
    const [createSubAgentFormError, setCreateSubAgentFormError] = useState('');

    /** Skills tab (6.11): client-side filter / sort over SKILL_METADATA */
    const [skillListFilter, setSkillListFilter] = useState(() => ({ ...SKILL_LIST_FILTER_INITIAL }));

    // Fetch live backend channels (retry/backoff helps when Vite proxy returns 502 while the API restarts after save/HMR)
    const { data: configData, isLoading, refetch } = useQuery({
        queryKey: ['channels'],
        queryFn: async () => {
            const res = await fetch(apiUrl('/api/channels'));
            if (!res.ok) {
                throw new Error(
                    res.status === 502
                        ? 'Backend vorübergehend nicht erreichbar (502).'
                        : `Could not load channel configuration (${res.status}).`
                );
            }
            return res.json();
        },
        retry: 4,
        retryDelay: (attemptIndex) => Math.min(400 * 2 ** attemptIndex, 8000)
    });
    const currentApplySignature = useMemo(() => buildApplyBaselineSignature(configData), [configData]);

    const { data: applyPreviewStatus, isFetching: applyPreviewFetching } = useQuery({
        queryKey: APPLY_PREVIEW_QUERY_KEY,
        enabled: !!configData?.ok && !openClawApplyOpen && !channelPersistInFlight,
        queryFn: async () => {
            const res = await fetch(apiUrl('/api/exports/openclaw/apply'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dryRun: true })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || data.error || `Apply preview failed (${res.status})`);
            return data;
        },
        staleTime: 5000,
        retry: 1
    });
    const markApplyDirty = useCallback(() => {
        localStorage.setItem(APPLY_DIRTY_STORAGE_KEY, '1');
        setApplyDirty(true);
        queryClient.invalidateQueries({ queryKey: APPLY_PREVIEW_QUERY_KEY });
    }, [queryClient]);

    const clearApplyDirty = useCallback(() => {
        if (currentApplySignature) {
            cleanApplySignatureRef.current = currentApplySignature;
            localStorage.setItem(APPLY_BASELINE_STORAGE_KEY, currentApplySignature);
        }
        localStorage.removeItem(APPLY_DIRTY_STORAGE_KEY);
        setApplyDirty(false);
        queryClient.invalidateQueries({ queryKey: APPLY_PREVIEW_QUERY_KEY });
    }, [currentApplySignature, queryClient]);

    useEffect(() => {
        if (!currentApplySignature) return;
        if (!cleanApplySignatureRef.current && !applyDirty) {
            cleanApplySignatureRef.current = currentApplySignature;
            localStorage.setItem(APPLY_BASELINE_STORAGE_KEY, currentApplySignature);
            return;
        }
        if (applyDirty && cleanApplySignatureRef.current === currentApplySignature) {
            localStorage.removeItem(APPLY_DIRTY_STORAGE_KEY);
            setApplyDirty(false);
        }
    }, [applyDirty, currentApplySignature]);

    useEffect(() => {
        if (applyDirty && applyPreviewStatus?.unchanged === true) {
            clearApplyDirty();
        }
    }, [applyDirty, applyPreviewStatus?.unchanged, clearApplyDirty]);

    const applyPreviewHasDiff = !!applyPreviewStatus && applyPreviewStatus.unchanged === false;
    const applyToOpenClawPending = applyDirty || applyPreviewHasDiff;

    /** Drop category/source if the skill catalog no longer contains that value (fixes “stuck” filters after reload). */
    useEffect(() => {
        const skills = configData?.data?.metadata?.skills;
        if (!skills || typeof skills !== 'object') return;
        const allCats = [...new Set(Object.values(skills).map((s) => s?.cat).filter(Boolean))];
        const allSrcs = [...new Set(Object.values(skills).map((s) => s?.src).filter(Boolean))];
        setSkillListFilter((f) => {
            let cat = f.cat;
            let src = f.src;
            if (cat && !allCats.includes(cat)) cat = '';
            if (src && !allSrcs.includes(src)) src = '';
            if (cat === f.cat && src === f.src) return f;
            return { ...f, cat, src };
        });
    }, [configData]);

    const mutation = useMutation({
        mutationKey: CM_PERSIST_MUTATION_KEY,
        mutationFn: async (payload) => {
            const body = { ...payload };
            if (body.assignedAgent === null) body.assignedAgent = undefined;
            const res = await fetch(apiUrl('/api/channels/update'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg =
                    data.message ||
                    (typeof data.error === 'string' ? data.error : null) ||
                    `Channel update failed (${res.status}).`;
                const err = new Error(msg);
                if (import.meta.env.DEV && data.details) {
                    console.error('[channels/update]', data.details);
                }
                throw err;
            }
            return data;
        },
        onMutate: async (newChannel) => {
            await queryClient.cancelQueries({ queryKey: ['channels'] });
            const previousChannels = queryClient.getQueryData(['channels']);
            if (previousChannels?.data?.channels) {
                const { channelId, ...patch } = newChannel;
                queryClient.setQueryData(['channels'], (old) => ({
                    ...old,
                    data: {
                        ...old.data,
                        channels: old.data.channels.map((c) =>
                            c.id === channelId ? { ...c, ...patch } : c
                        )
                    }
                }));
            }
            return { previousChannels };
        },
        onError: (err, newChannel, context) => {
            if (context?.previousChannels) {
                queryClient.setQueryData(['channels'], context.previousChannels);
            }
            window.alert(err?.message || 'Channel update failed.');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['channels'] });
            queryClient.invalidateQueries({ queryKey: APPLY_PREVIEW_QUERY_KEY });
        },
        onSuccess: () => {
            markApplyDirty();
        }
    });

    const backendChannels = configData?.data?.channels || [];
    /** TTG000 before TTG001 before TTG010 — numeric prefix from name, not API / Telegram id order. */
    const displayChannels = useMemo(() => sortTtgChannels(backendChannels), [backendChannels]);

    const updateAgentMutation = useMutation({
        mutationKey: CM_PERSIST_MUTATION_KEY,
        mutationFn: async (payload) => {
            const res = await fetch(apiUrl('/api/channels/updateAgent'), {
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
        mutationKey: CM_PERSIST_MUTATION_KEY,
        mutationFn: async (payload) => {
            const res = await fetch(apiUrl('/api/channels/updateSubAgent'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error('Update failed');
            return res.json();
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['channels'] })
    });

    const createSubAgentMutation = useMutation({
        mutationKey: CM_PERSIST_MUTATION_KEY,
        mutationFn: async (payload) => {
            const res = await fetch(apiUrl('/api/channels/createSubAgent'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || `Create failed (${res.status})`);
            }
            return data;
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['channels'] })
    });

    const deleteSubAgentMutation = useMutation({
        mutationKey: CM_PERSIST_MUTATION_KEY,
        mutationFn: async (subAgentId) => {
            const res = await fetch(apiUrl('/api/channels/deleteSubAgent'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subAgentId })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || `Delete failed (${res.status})`);
            }
            return data;
        },
        onError: (err) => {
            window.alert(err?.message || 'Sub-Agent konnte nicht gelöscht werden.');
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['channels'] })
    });

    const reorderMainAgentsMutation = useMutation({
        mutationKey: CM_PERSIST_MUTATION_KEY,
        mutationFn: async (orderedAgentIds) => {
            const res = await fetch(apiUrl('/api/channels/reorderMainAgents'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderedAgentIds })
            });
            if (!res.ok) throw new Error('Reorder failed');
            return res.json();
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['channels'] })
    });

    /** C1b.2e — OpenClaw `channels.telegram` account-level gates (persisted in channel_config.json; optional Apply slice). */
    const liveTelegramPolicy = configData?.data?.openclawTelegramAccountLive;
    const [telegramPolicyDraft, setTelegramPolicyDraft] = useState(() => ({
        ...DEFAULT_TELEGRAM_ACCOUNT_POLICY
    }));
    const serverTelegramPolicyJson = useMemo(() => {
        const p = configData?.data?.telegramAccountPolicy;
        if (!configData?.ok || !p || typeof p !== 'object') return null;
        try {
            return JSON.stringify(p);
        } catch {
            return null;
        }
    }, [configData?.ok, configData?.data?.telegramAccountPolicy]);
    useEffect(() => {
        if (serverTelegramPolicyJson == null) return;
        try {
            const p = JSON.parse(serverTelegramPolicyJson);
            setTelegramPolicyDraft({
                ...DEFAULT_TELEGRAM_ACCOUNT_POLICY,
                ...p,
                allowFrom: Array.isArray(p.allowFrom) ? p.allowFrom : [],
                groupAllowFrom: Array.isArray(p.groupAllowFrom) ? p.groupAllowFrom : []
            });
        } catch {
            /* ignore */
        }
    }, [serverTelegramPolicyJson]);

    const updateTelegramPolicyMutation = useMutation({
        mutationKey: CM_PERSIST_MUTATION_KEY,
        mutationFn: async (body) => {
            const res = await fetch(apiUrl('/api/channels/updateTelegramAccountPolicy'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || `Telegram policy save failed (${res.status})`);
            }
            return data;
        },
        onError: (err) => window.alert(err?.message || 'Save failed.'),
        onSuccess: () => {
            markApplyDirty();
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['channels'] });
            queryClient.invalidateQueries({ queryKey: APPLY_PREVIEW_QUERY_KEY });
        }
    });

    /** C1b.2c — opt-in agents.defaults.model.primary on Apply */
    const liveAgentsDefaultsModel = configData?.data?.openclawAgentsDefaultsLive?.modelPrimary ?? null;
    const [agentsDefaultsDraft, setAgentsDefaultsDraft] = useState(() => ({
        ...DEFAULT_OPENCLAW_AGENTS_DEFAULTS_POLICY
    }));
    const serverAgentsDefaultsJson = useMemo(() => {
        const p = configData?.data?.openclawAgentsDefaultsPolicy;
        if (!configData?.ok || !p || typeof p !== 'object') return null;
        try {
            return JSON.stringify(p);
        } catch {
            return null;
        }
    }, [configData?.ok, configData?.data?.openclawAgentsDefaultsPolicy]);
    useEffect(() => {
        if (serverAgentsDefaultsJson == null) return;
        try {
            const p = JSON.parse(serverAgentsDefaultsJson);
            setAgentsDefaultsDraft({
                ...DEFAULT_OPENCLAW_AGENTS_DEFAULTS_POLICY,
                ...p,
                modelPrimary: typeof p.modelPrimary === 'string' ? p.modelPrimary : ''
            });
        } catch {
            /* ignore */
        }
    }, [serverAgentsDefaultsJson]);

    const updateAgentsDefaultsPolicyMutation = useMutation({
        mutationKey: CM_PERSIST_MUTATION_KEY,
        mutationFn: async (body) => {
            const res = await fetch(apiUrl('/api/channels/updateOpenclawAgentsDefaultsPolicy'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.message || `Agents defaults policy save failed (${res.status})`);
            }
            return data;
        },
        onError: (err) => window.alert(err?.message || 'Save failed.'),
        onSuccess: () => {
            markApplyDirty();
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['channels'] });
            queryClient.invalidateQueries({ queryKey: APPLY_PREVIEW_QUERY_KEY });
        }
    });

    const backendAgents = configData?.data?.agents || [];
    const backendSubAgents = configData?.data?.subAgents || [];
    
    // Dynamic Metadata (Data Integrity Phase 1)
    const activeMetadata = configData?.data?.metadata || { models: [], mainAgents: {}, subAgentsDict: {}, skills: {} };
    const AVAILABLE_MODELS = activeMetadata.models || [];
    const MAIN_AGENTS = activeMetadata.mainAgents || {};
    const SKILL_METADATA = activeMetadata.skills || {};

    const workspaceSkillsRoot = '/home/claw-agentbox/.openclaw/workspace/skills';
    const bundledOpenclawSkillsRoot = '/home/claw-agentbox/.npm-global/lib/node_modules/openclaw/skills';

    /** Skill folder on disk (Workbench root for that skill). */
    const resolveSkillFsPath = (id, skill) => {
        if (skill?.src === 'workspace' || id === 'omniverse-extension-development' || id === 'usd-development') {
            return `${workspaceSkillsRoot}/${id}`;
        }
        return `${bundledOpenclawSkillsRoot}/${id}`;
    };

    const moveMainAgent = (agentId, direction) => {
        const ids = backendAgents.map((a) => a.id);
        const i = ids.indexOf(agentId);
        if (i < 0) return;
        const j = direction === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= ids.length) return;
        const next = [...ids];
        [next[i], next[j]] = [next[j], next[i]];
        reorderMainAgentsMutation.mutate(next);
    };

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

    const openCreateSubAgentModal = () => {
        setCreateSubAgentFormError('');
        setNewSubAgentId('');
        setNewSubAgentName('');
        setNewSubAgentDescription('');
        const defaultParent =
            backendAgents.find((a) => a.id === 'tars')?.id ||
            backendAgents[0]?.id ||
            'tars';
        setNewSubAgentParent(defaultParent);
        setCreateSubAgentOpen(true);
    };

    const submitCreateSubAgent = () => {
        setCreateSubAgentFormError('');
        const id = newSubAgentId.trim();
        const name = newSubAgentName.trim();
        if (!id || !name) {
            setCreateSubAgentFormError('ID und Name sind erforderlich.');
            return;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
            setCreateSubAgentFormError('ID: nur Buchstaben, Ziffern, Bindestrich und Unterstrich.');
            return;
        }
        createSubAgentMutation.mutate(
            {
                id,
                name,
                description: newSubAgentDescription.trim(),
                parent: newSubAgentParent,
                additionalSkills: [],
                enabled: true
            },
            {
                onSuccess: () => {
                    setCreateSubAgentOpen(false);
                },
                onError: (err) => {
                    setCreateSubAgentFormError(err.message || 'Create failed.');
                }
            }
        );
    };

    const handleDeleteSubAgent = (sub) => {
        const label = sub.name?.trim() || sub.id;
        const ok = window.confirm(
            `Sub-Agent „${label}“ (${sub.id}) wirklich löschen? Die Zuordnung und Einträge in Kanälen werden bereinigt.`
        );
        if (!ok) return;
        deleteSubAgentMutation.mutate(sub.id);
    };

    /** Only sends fields the server applies — avoids leaking GET-merge-only keys that can break Zod. */
    const handleUpdateChannel = (channelId, field, value) => {
        mutation.mutate({ channelId, [field]: value });
    };

    
    const handleAddSkill = (channelId, skill) => {
        const channel = backendChannels.find(c => c.id === channelId);
        const skills = channel?.skills || [];
        if (!skills.includes(skill)) {
            mutation.mutate({ channelId, skills: [...skills, skill] });
        }
    };

    const handleRemoveSkill = (channelId, skill) => {
        const channel = backendChannels.find(c => c.id === channelId);
        if (channel?.skills) {
            mutation.mutate({ channelId, skills: channel.skills.filter(s => s !== skill) });
        }
    };
    
    const handleToggleSkill = (channelId, skill) => {
        const channel = backendChannels.find(c => c.id === channelId);
        if (channel) {
            let inactive = channel.inactiveSkills || [];
            if (inactive.includes(skill)) inactive = inactive.filter(s => s !== skill);
            else inactive = [...inactive, skill];
            mutation.mutate({ channelId, inactiveSkills: inactive });
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
        if (e.target.checked) setSelectedChannels(displayChannels.map((c) => c.id));
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
        window.location.href = apiUrl('/api/channels/export');
    };

    const handleReload = async () => {
        await fetch(apiUrl('/api/channels/reload'), { method: 'POST' });
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
                    const res = await fetch(apiUrl('/api/channels/import'), {
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
        handleReload();
        window.alert(
            'Note: channel and agent edits are written to channel_config.json on every action.\n\n' +
                'This button only refreshes the view (like Reload). “Apply to OpenClaw” is not required for that.'
        );
    };

    /**
     * At most one row may use the OpenClaw Chat tab: each ChatPanel opens an SSE
     * to `/api/chat/:id/stream`. Browsers limit ~6 concurrent connections per
     * origin; many open chats caused connection drops, reconnect storms, and
     * `Failed to fetch` on session resolve.
     */
    const setRowSubtabsExclusive = useCallback((channelId, tab) => {
        setRowSubtabs((prev) => {
            const next = { ...prev };
            const idStr = String(channelId);
            if (tab === 'chat') {
                for (const k of Object.keys(next)) {
                    if (next[k] === 'chat' && k !== idStr) next[k] = 'config';
                }
            }
            next[idStr] = tab;
            return next;
        });
    }, []);

    /** Convenience: set every channel row height (and optionally the workspace tab) for all TTGs. */
    const applyBulkChannelRows = (heightPx, subTab) => {
        setActiveTab('channels');
        const ids = displayChannels.map((c) => c.id);
        if (ids.length === 0) return;
        setRowHeights((prev) => {
            const next = { ...prev };
            for (const id of ids) next[id] = heightPx;
            return next;
        });
        if (subTab != null) {
            setRowSubtabs((prev) => {
                const next = { ...prev };
                if (subTab === 'chat' && ids.length > 0) {
                    for (const id of ids) next[id] = 'config';
                    next[ids[0]] = 'chat';
                } else {
                    for (const id of ids) next[id] = subTab;
                }
                return next;
            });
        }
    };

    const renderManageChannels = () => (
        <>
            <TelegramAccountPolicyPanel
                draft={telegramPolicyDraft}
                setDraft={setTelegramPolicyDraft}
                live={liveTelegramPolicy}
                onSave={(body) => updateTelegramPolicyMutation.mutate(body)}
                savePending={updateTelegramPolicyMutation.isPending}
            />
            <OpenclawAgentsDefaultsPolicyPanel
                draft={agentsDefaultsDraft}
                setDraft={setAgentsDefaultsDraft}
                liveModelPrimary={liveAgentsDefaultsModel}
                modelOptions={AVAILABLE_MODELS}
                onSave={(body) => updateAgentsDefaultsPolicyMutation.mutate(body)}
                savePending={updateAgentsDefaultsPolicyMutation.isPending}
            />
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
                    <label
                        className="info-tooltip-container bulk-selection-tooltip-container"
                        onMouseEnter={setBulkTooltipPosition}
                        onFocus={setBulkTooltipPosition}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--text-primary)', cursor: 'pointer' }}
                    >
                        <input
                            type="checkbox"
                            checked={selectedChannels.length === displayChannels.length && displayChannels.length > 0}
                            onChange={handleSelectAll}
                            aria-label="Select all TTGs for bulk model and skill changes"
                            style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                        />
                        Select All ({selectedChannels.length})
                        <span className="info-tooltip-text info-tooltip-text-left bulk-selection-tooltip" style={bulkTooltipStyle}>{BULK_SELECTION_TOOLTIP}</span>
                    </label>
                    <select value={bulkModel} onChange={e => setBulkModel(e.target.value)} style={{ width: '160px', padding: '4px 8px', fontSize: '13px', background: '#13141c', border: '1px solid var(--border-color)', color: '#fff' }}>
                        <option value="">Set model...</option>
                        {AVAILABLE_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <button onClick={handleApplyBulkModel} disabled={selectedChannels.length === 0} style={{ padding: '4px 12px', fontSize: '13px', whiteSpace: 'nowrap', cursor: selectedChannels.length === 0 ? 'not-allowed' : 'pointer', background: '#2a2b36', border: '1px solid var(--border-color)', color: '#fff', opacity: selectedChannels.length === 0 ? 0.5 : 1 }}>Apply</button>
                    
                    <select value={bulkSkill} onChange={e => setBulkSkill(e.target.value)} style={{ width: '160px', padding: '4px 8px', fontSize: '13px', background: '#13141c', border: '1px solid var(--border-color)', color: '#fff' }}>
                        <option value="">Add skill...</option>
                        {Object.keys(SKILL_METADATA).map((s) => (
                            <option key={s} value={s} title={SKILL_METADATA[s]?.desc || s}>
                                {formatSkillOptionLabel(s, SKILL_METADATA[s]?.desc)}
                            </option>
                        ))}
                    </select>
                    <button onClick={handleAddBulkSkill} disabled={selectedChannels.length === 0} style={{ padding: '4px 12px', fontSize: '13px', whiteSpace: 'nowrap', cursor: selectedChannels.length === 0 ? 'not-allowed' : 'pointer', background: '#2a2b36', border: '1px solid var(--border-color)', color: '#fff', opacity: selectedChannels.length === 0 ? 0.5 : 1 }}>Add</button>
                </div>
            </div>

            <table className="channel-table" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none' }}>
                <thead>
                    <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>
                            <span
                                className="info-tooltip-container bulk-selection-tooltip-container"
                                onMouseEnter={setBulkTooltipPosition}
                                onFocus={setBulkTooltipPosition}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedChannels.length === displayChannels.length && displayChannels.length > 0}
                                    onChange={handleSelectAll}
                                    aria-label="Select all TTGs for bulk model and skill changes"
                                    style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                                />
                                <span className="info-tooltip-text info-tooltip-text-left bulk-selection-tooltip" style={bulkTooltipStyle}>{BULK_SELECTION_TOOLTIP}</span>
                            </span>
                        </th>
                        <th style={{ width: '250px' }}>TTG (Telegram Topic Group)</th>
                        <th>Configuration & Chat Workspace</th>
                    </tr>
                </thead>
                <tbody>
                    {displayChannels.map((tg) => (
                        <ChannelManagerChannelRow
                            key={tg.id}
                            tg={tg}
                            channelState={tg}
                            rowHeights={rowHeights}
                            setRowHeights={setRowHeights}
                            rowSubtabs={rowSubtabs}
                            setRowSubtabs={setRowSubtabs}
                            setRowSubtabsExclusive={setRowSubtabsExclusive}
                            selectedChannels={selectedChannels}
                            handleToggleSelect={handleToggleSelect}
                            MAIN_AGENTS={MAIN_AGENTS}
                            SKILL_METADATA={SKILL_METADATA}
                            AVAILABLE_MODELS={AVAILABLE_MODELS}
                            backendAgents={backendAgents}
                            backendSubAgents={backendSubAgents}
                            navigateToAgent={navigateToAgent}
                            handleUpdateChannel={handleUpdateChannel}
                            handleAddSkill={handleAddSkill}
                            handleRemoveSkill={handleRemoveSkill}
                            handleToggleSkill={handleToggleSkill}
                            handleToggleAgentSkill={handleToggleAgentSkill}
                            handleToggleSubAgentSkill={handleToggleSubAgentSkill}
                            handleSubAgentToggle={handleSubAgentToggle}
                            onSubAgentUnassignParent={(subId) =>
                                updateSubAgentMutation.mutate({ subAgentId: subId, parent: null })
                            }
                            onSubAgentAssignToTars={(subId) =>
                                updateSubAgentMutation.mutate({ subAgentId: subId, parent: 'tars' })
                            }
                            rowHeightExpanded={ROW_HEIGHT_EXPANDED}
                            rowHeightCollapsed={ROW_HEIGHT_COLLAPSED}
                        />
                    ))}

                </tbody>
            </table>
        </>
    );

    
    const renderSkillsTab = () => {
        const allCats = [...new Set(Object.values(SKILL_METADATA).map((s) => s.cat).filter(Boolean))].sort();
        const allSrcs = [...new Set(Object.values(SKILL_METADATA).map((s) => s.src).filter(Boolean))].sort();
        const catFilter = skillListFilter.cat && allCats.includes(skillListFilter.cat) ? skillListFilter.cat : '';
        const srcFilter = skillListFilter.src && allSrcs.includes(skillListFilter.src) ? skillListFilter.src : '';
        let skillEntries = Object.entries(SKILL_METADATA);
        const qlow = skillListFilter.q.trim().toLowerCase();
        if (qlow) {
            skillEntries = skillEntries.filter(
                ([id, s]) =>
                    id.toLowerCase().includes(qlow) ||
                    (s.desc && s.desc.toLowerCase().includes(qlow)) ||
                    (s.origin && String(s.origin).toLowerCase().includes(qlow))
            );
        }
        if (catFilter) skillEntries = skillEntries.filter(([, s]) => s.cat === catFilter);
        if (srcFilter) skillEntries = skillEntries.filter(([, s]) => s.src === srcFilter);
        if (skillListFilter.defOnly) skillEntries = skillEntries.filter(([, s]) => s.def);
        skillEntries.sort((a, b) => {
            if (skillListFilter.sort === 'name-desc') return b[0].localeCompare(a[0]);
            if (skillListFilter.sort === 'cat') {
                const ca = a[1].cat || '';
                const cb = b[1].cat || '';
                return ca.localeCompare(cb) || a[0].localeCompare(b[0]);
            }
            return a[0].localeCompare(b[0]);
        });

        return (
        <div style={{ padding: '24px 0' }}>
            <h2 style={{ marginBottom: '12px' }}>Available Skills</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Filter and sort are local to this browser session (Sub-Task 6.11). Registry source: backend merged catalog.
            </p>
            <div style={{ marginBottom: '20px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                <input
                    type="search"
                    placeholder="Search id / description / origin…"
                    value={skillListFilter.q}
                    onChange={(e) => setSkillListFilter((f) => ({ ...f, q: e.target.value }))}
                    style={{
                        width: '100%',
                        marginBottom: '8px',
                        padding: '6px 10px',
                        background: '#13141c',
                        border: '1px solid var(--border-color)',
                        color: '#fff',
                        fontSize: '12px',
                        boxSizing: 'border-box'
                    }}
                />
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'flex-start',
                        gap: '6px',
                        alignItems: 'center'
                    }}
                >
                    <select
                        value={catFilter}
                        onChange={(e) => setSkillListFilter((f) => ({ ...f, cat: e.target.value }))}
                        style={{ flex: '0 1 auto', minWidth: '110px', padding: '5px 6px', background: '#13141c', border: '1px solid var(--border-color)', color: '#fff', fontSize: '12px' }}
                    >
                        <option value="">All categories</option>
                        {allCats.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                    <select
                        value={srcFilter}
                        onChange={(e) => setSkillListFilter((f) => ({ ...f, src: e.target.value }))}
                        style={{ flex: '0 1 auto', minWidth: '110px', padding: '5px 6px', background: '#13141c', border: '1px solid var(--border-color)', color: '#fff', fontSize: '12px' }}
                    >
                        <option value="">All sources</option>
                        {allSrcs.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                    <select
                        value={skillListFilter.sort}
                        onChange={(e) => setSkillListFilter((f) => ({ ...f, sort: e.target.value }))}
                        style={{ flex: '0 1 auto', minWidth: '96px', padding: '5px 6px', background: '#13141c', border: '1px solid var(--border-color)', color: '#fff', fontSize: '12px' }}
                    >
                        <option value="name-asc">Name A–Z</option>
                        <option value="name-desc">Name Z–A</option>
                        <option value="cat">Category</option>
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)', flex: '0 1 auto' }}>
                        <input
                            type="checkbox"
                            checked={skillListFilter.defOnly}
                            onChange={(e) => setSkillListFilter((f) => ({ ...f, defOnly: e.target.checked }))}
                        />
                        Default only
                    </label>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', flex: '0 0 auto' }}>{skillEntries.length} shown</span>
                    <button
                        type="button"
                        onClick={() => setSkillListFilter({ ...SKILL_LIST_FILTER_INITIAL })}
                        style={{
                            marginLeft: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            color: 'var(--text-secondary)'
                        }}
                    >
                        Filter zurücksetzen
                    </button>
                </div>
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
                {skillEntries.map(([id, skill]) => {
                    let colorCode = '#50e3c2'; // BUNDLED
                    if (skill.src === 'managed') colorCode = '#e3c450';
                    if (skill.src === 'workspace') colorCode = '#6e9cff';
                    if (skill.src === 'custom' || skill.src === 'modified') colorCode = '#e35050';

                    return (
                        <div key={id} className="skill-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderLeft: `4px solid ${colorCode}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <h3 style={{ margin: 0, color: colorCode, fontWeight: 700 }}>{id}</h3>
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
                                        {id === 'ide-openclaw-memory-sync' && "Appends curated gems and short session summaries from the IDE workbench to TARS_MEMORY.md for triad / harness continuity; optional read-back at session start."}
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '6px',
                                                padding: '8px 10px',
                                                background: 'rgba(0,0,0,0.18)',
                                                display: 'flex',
                                                flexWrap: 'wrap',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '10px'
                                            }}
                                        >
                                            <div
                                                className="tg-id"
                                                style={{
                                                    flex: '1 1 200px',
                                                    minWidth: 0,
                                                    marginTop: 0,
                                                    background: 'rgba(255,255,255,0.05)',
                                                    padding: '6px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '10px',
                                                    wordBreak: 'break-all'
                                                }}
                                            >
                                                {`${resolveSkillFsPath(id, skill).replace(/\/$/, '')}/SKILL.md`}
                                            </div>
                                            <a
                                                href={`/workbench?path=${encodeURIComponent(resolveSkillFsPath(id, skill))}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="btn-open"
                                                style={{
                                                    textDecoration: 'none',
                                                    background: 'rgba(255,255,255,0.1)',
                                                    border: '1px solid var(--border-color)',
                                                    color: '#fff',
                                                    padding: '6px 12px',
                                                    fontSize: '11px',
                                                    borderRadius: '4px',
                                                    whiteSpace: 'nowrap'
                                                }}
                                                onClick={() => {
                                                    const dir = resolveSkillFsPath(id, skill).replace(/\/$/, '');
                                                    const skillMd = `${dir}/SKILL.md`;
                                                    const st = useWorkbenchStore.getState();
                                                    st.addWorkspace(dir);
                                                    st.setCurrentRoot(dir);
                                                    st.setActiveFile(skillMd);
                                                }}
                                            >
                                                EDIT in Workbench ➔
                                            </a>
                                        </div>

                                        {skill.src === 'managed' && (
                                            <div
                                                style={{
                                                    border: '1px solid rgba(227, 196, 80, 0.35)',
                                                    borderRadius: '6px',
                                                    padding: '8px 10px',
                                                    background: 'rgba(227, 196, 80, 0.06)',
                                                    display: 'flex',
                                                    flexWrap: 'wrap',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '10px'
                                                }}
                                            >
                                                <div
                                                    className="tg-id"
                                                    style={{
                                                        flex: '1 1 200px',
                                                        minWidth: 0,
                                                        marginTop: 0,
                                                        color: '#e3c450',
                                                        padding: '6px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '10px',
                                                        wordBreak: 'break-all'
                                                    }}
                                                >
                                                    {skill.url || `https://github.com/openclaw/skills/tree/main/skills/${id}`}
                                                </div>
                                                <a
                                                    href={skill.url || `https://github.com/openclaw/skills/tree/main/skills/${id}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    style={{
                                                        textDecoration: 'none',
                                                        background: '#2a2b36',
                                                        border: '1px solid #e3c450',
                                                        color: '#fff',
                                                        padding: '6px 12px',
                                                        fontSize: '11px',
                                                        borderRadius: '4px',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    Open Web Source ➔
                                                </a>
                                            </div>
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
    };


    
    const renderAgentsTab = () => (
        <>
        <div style={{ padding: '24px 0' }}>
            <h2 style={{ marginBottom: '24px' }}>Main Agents</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '-12px', marginBottom: '20px' }}>
                Order is saved to config and used for this list. Use the arrows to move a card up or down.
            </p>
            <div style={{ display: 'grid', gap: '16px', marginBottom: '40px' }}>
                {backendAgents.map((agent, agentIndex) => (
                    <div key={agent.id} id={`agent-card-${agent.id}`} className="agent-card main" style={{ borderColor: agent.color, transition: 'box-shadow 0.3s' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
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
                            {Object.keys(SKILL_METADATA).map((s) => (
                                <option key={s} value={s} title={SKILL_METADATA[s]?.desc || s}>
                                    {formatSkillOptionLabel(s, SKILL_METADATA[s]?.desc)}
                                </option>
                            ))}
                        </select>

                        <div style={{ fontSize: '11px', color: agent.color, marginBottom: '8px', marginTop: '20px' }}>Sub-Agents</div>
                        {backendSubAgents
                            .filter((sub) => sub.parent === agent.id)
                            .map((sub) => {
                                const isOn = sub.enabled !== false;
                                const line = (sub.description || '').trim() || `Zugeordnet zu ${agent.name}`;
                                return (
                                    <div
                                        key={`sub-assign-${sub.id}`}
                                        className={`skill-item ${isOn ? 'active' : ''}`}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'auto auto auto minmax(0, 1fr) auto auto',
                                            alignItems: 'center',
                                            gap: '10px',
                                            width: '100%',
                                            marginBottom: '6px'
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isOn}
                                            onChange={() =>
                                                updateSubAgentMutation.mutate({
                                                    subAgentId: sub.id,
                                                    enabled: !isOn
                                                })
                                            }
                                            style={{ flexShrink: 0, margin: 0 }}
                                        />
                                        <span className="skill-name" style={{ whiteSpace: 'nowrap' }}>{sub.name || sub.id}</span>
                                        <span className="skill-separator" style={{ color: 'var(--text-secondary)' }}>|</span>
                                        <span className="skill-desc" style={{ lineHeight: '1.4', paddingRight: '8px', minWidth: 0, fontSize: '12px' }}>
                                            {line}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: '9px',
                                                color: agent.color,
                                                textTransform: 'uppercase',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            SUB-AGENT
                                        </span>
                                        <button
                                            type="button"
                                            title="Zuordnung aufheben (ohne Hauptagent)"
                                            onClick={() => updateSubAgentMutation.mutate({ subAgentId: sub.id, parent: null })}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                padding: '0 4px',
                                                justifySelf: 'end'
                                            }}
                                        >
                                            x
                                        </button>
                                    </div>
                                );
                            })}
                        <select
                            onChange={(e) => {
                                const sid = e.target.value;
                                if (sid) {
                                    updateSubAgentMutation.mutate({ subAgentId: sid, parent: agent.id });
                                    e.target.value = '';
                                }
                            }}
                            style={{
                                width: '100%',
                                marginTop: '8px',
                                padding: '6px 8px',
                                background: '#13141c',
                                outline: 'none',
                                border: '1px solid var(--border-color)',
                                color: 'var(--text-secondary)',
                                borderRadius: '4px'
                            }}
                        >
                            <option value="">+ Sub-Agent zuordnen…</option>
                            {backendSubAgents
                                .filter((s) => s.parent !== agent.id)
                                .map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name || s.id}
                                        {s.parent ? ` (aktuell: ${s.parent})` : ' (nicht zugeordnet)'}
                                    </option>
                                ))}
                        </select>
                            </div>
                            <div
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                    flexShrink: 0,
                                    paddingTop: '2px'
                                }}
                                title="Reorder main agents"
                            >
                                <button
                                    type="button"
                                    disabled={agentIndex === 0 || reorderMainAgentsMutation.isPending}
                                    onClick={() => moveMainAgent(agent.id, 'up')}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '34px',
                                        height: '30px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: agentIndex === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                                        color: agentIndex === 0 ? 'var(--text-secondary)' : 'var(--text-primary)',
                                        cursor: agentIndex === 0 ? 'not-allowed' : 'pointer'
                                    }}
                                    aria-label={`Move ${agent.name} up`}
                                >
                                    <ChevronUp size={18} />
                                </button>
                                <button
                                    type="button"
                                    disabled={agentIndex >= backendAgents.length - 1 || reorderMainAgentsMutation.isPending}
                                    onClick={() => moveMainAgent(agent.id, 'down')}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '34px',
                                        height: '30px',
                                        borderRadius: '6px',
                                        border: '1px solid var(--border-color)',
                                        background: agentIndex >= backendAgents.length - 1 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                                        color: agentIndex >= backendAgents.length - 1 ? 'var(--text-secondary)' : 'var(--text-primary)',
                                        cursor: agentIndex >= backendAgents.length - 1 ? 'not-allowed' : 'pointer'
                                    }}
                                    aria-label={`Move ${agent.name} down`}
                                >
                                    <ChevronDown size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', marginTop: '8px' }}>
                <div>
                    <h2 style={{ marginBottom: '4px', marginTop: 0 }}>Sub-Agents — Zusätzliche Skills</h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
                        Pro Sub-Agent: zusätzliche Skills (über die Zuordnung oben beim jeweiligen Hauptagenten).
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreateSubAgentModal}
                    className="primary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', whiteSpace: 'nowrap' }}
                >
                    <Plus size={16} aria-hidden /> Sub-Agent anlegen
                </button>
            </div>
            <div style={{ display: 'grid', gap: '16px' }}>
                {backendSubAgents.map(sub => {
                    const parentColor = backendAgents.find(a => a.id === sub.parent)?.color || '#50e3c2';
                    return (
                        <div key={sub.id} id={`agent-card-${sub.id}`} className="agent-card main" style={{ borderColor: parentColor, transition: 'box-shadow 0.3s' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                <h3 style={{ color: parentColor, margin: 0 }}>{sub.name}</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                    <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                        {sub.parent || '—'}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`Sub-Agent ${sub.id} löschen`}
                                        title="Sub-Agent löschen"
                                        disabled={deleteSubAgentMutation.isPending}
                                        onClick={() => handleDeleteSubAgent(sub)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '32px',
                                            height: '32px',
                                            padding: 0,
                                            borderRadius: '6px',
                                            border: '1px solid rgba(227, 80, 80, 0.45)',
                                            background: 'rgba(227, 80, 80, 0.12)',
                                            color: '#e35050',
                                            cursor: deleteSubAgentMutation.isPending ? 'not-allowed' : 'pointer',
                                            opacity: deleteSubAgentMutation.isPending ? 0.5 : 1
                                        }}
                                    >
                                        <X size={18} strokeWidth={2.5} aria-hidden />
                                    </button>
                                </div>
                            </div>
                            
                            <div style={{ color: 'var(--text-secondary)', margin: '8px 0 16px 0', fontSize: '14px' }}>
                                {sub.description?.trim() ? sub.description : '—'}
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
                                {Object.keys(SKILL_METADATA).map((s) => (
                                    <option key={s} value={s} title={SKILL_METADATA[s]?.desc || s}>
                                        {formatSkillOptionLabel(s, SKILL_METADATA[s]?.desc)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    );
                })}
            </div>
        </div>

        {createSubAgentOpen && (
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-subagent-title"
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.65)',
                    zIndex: 200,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px'
                }}
                onClick={(e) => {
                    if (e.target === e.currentTarget && !createSubAgentMutation.isPending) setCreateSubAgentOpen(false);
                }}
            >
                <div
                    style={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        padding: '24px',
                        maxWidth: '440px',
                        width: '100%',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <h3 id="create-subagent-title" style={{ marginTop: 0 }}>Sub-Agent anlegen</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '-8px' }}>
                        Neue Zeile in <code style={{ fontSize: '11px' }}>channel_config.json</code> (eindeutige ID).
                    </p>
                    <div style={{ display: 'grid', gap: '12px', marginTop: '16px' }}>
                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>ID (Slug)</span>
                            <input
                                value={newSubAgentId}
                                onChange={(e) => setNewSubAgentId(e.target.value)}
                                placeholder="z. B. my-researcher"
                                autoComplete="off"
                                style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#13141c', color: 'var(--text-primary)' }}
                            />
                        </label>
                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>Anzeigename</span>
                            <input
                                value={newSubAgentName}
                                onChange={(e) => setNewSubAgentName(e.target.value)}
                                placeholder="z. B. My Researcher"
                                autoComplete="off"
                                style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#13141c', color: 'var(--text-primary)' }}
                            />
                        </label>
                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>Beschreibung (optional)</span>
                            <textarea
                                value={newSubAgentDescription}
                                onChange={(e) => setNewSubAgentDescription(e.target.value)}
                                rows={3}
                                placeholder="Kurzbeschreibung für die Kartenansicht"
                                style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#13141c', color: 'var(--text-primary)', resize: 'vertical' }}
                            />
                        </label>
                        <label style={{ display: 'grid', gap: '4px', fontSize: '12px' }}>
                            <span>Hauptagent (parent)</span>
                            <select
                                value={newSubAgentParent}
                                onChange={(e) => setNewSubAgentParent(e.target.value)}
                                style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#13141c', color: 'var(--text-primary)' }}
                            >
                                {backendAgents.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name || a.id}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    {createSubAgentFormError ? (
                        <p style={{ color: '#e35050', fontSize: '12px', marginTop: '12px', marginBottom: 0 }}>{createSubAgentFormError}</p>
                    ) : null}
                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                        <button
                            type="button"
                            disabled={createSubAgentMutation.isPending}
                            onClick={() => !createSubAgentMutation.isPending && setCreateSubAgentOpen(false)}
                        >
                            Abbrechen
                        </button>
                        <button type="button" className="primary" disabled={createSubAgentMutation.isPending} onClick={submitCreateSubAgent}>
                            {createSubAgentMutation.isPending ? '…' : 'Anlegen'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );


    return (
        <div style={{ minHeight: '100vh', padding: '0', display: 'flex', flexDirection: 'column' }}>
            
            {/* STICKY HEADER — grid keeps center actions in one row (no vertical stack from flex-wrap). */}
            <header
                style={{
                    padding: '20px 24px',
                    margin: 0,
                    position: 'sticky',
                    top: 0,
                    background: 'var(--bg-primary)',
                    borderBottom: '1px solid var(--border-color)',
                    zIndex: 100,
                    display: 'grid',
                    gridTemplateColumns:
                        activeTab === 'channels'
                            ? 'minmax(0, auto) minmax(0, 1fr) auto'
                            : 'minmax(0, auto) auto',
                    alignItems: 'center',
                    gap: '12px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px', minWidth: 0 }}>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.4rem' }}>
                        📺 Channel Manager
                    </h1>
                    <div className="tabs" style={{ marginTop: '4px' }}>
                        <button className={`tab ${activeTab === 'channels' ? 'active' : ''}`} onClick={() => setActiveTab('channels')}>Manage Channels</button>
                        <button className={`tab ${activeTab === 'agents' ? 'active' : ''}`} onClick={() => setActiveTab('agents')}>Agents</button>
                        <button className={`tab ${activeTab === 'skills' ? 'active' : ''}`} onClick={() => setActiveTab('skills')}>Skills</button>
                    </div>
                </div>

                {activeTab === 'channels' && (
                    <div
                        className="header-actions"
                        style={{
                            justifyContent: 'center',
                            flexWrap: 'nowrap',
                            minWidth: 0,
                            overflowX: 'auto'
                        }}
                        aria-label="Alle TTG-Zeilen auf einmal"
                    >
                        <button
                            type="button"
                            disabled={backendChannels.length === 0}
                            title="Alle Zeilen ~260px; Tab Configuration (vermeidet Layout-Kollision nach Chat/IDE)"
                            onClick={() => applyBulkChannelRows(ROW_HEIGHT_COLLAPSED, 'config')}
                        >
                            Collapse all
                        </button>
                        <button
                            type="button"
                            disabled={backendChannels.length === 0}
                            title={`Alle Zeilen auf ${ROW_HEIGHT_EXPANDED}px, Tab: Configuration`}
                            onClick={() => applyBulkChannelRows(ROW_HEIGHT_EXPANDED, 'config')}
                        >
                            Configure all
                        </button>
                        <button
                            type="button"
                            disabled={backendChannels.length === 0}
                            title={`Alle Zeilen auf ${ROW_HEIGHT_EXPANDED}px. Nur die erste TTG öffnet „OpenClaw Chat“ (sonst brechen Browser-SSE-Limits bei ~6 Verbindungen/Host ein).`}
                            onClick={() => applyBulkChannelRows(ROW_HEIGHT_EXPANDED, 'chat')}
                        >
                            Open Claw Chat all
                        </button>
                        <button
                            type="button"
                            disabled={backendChannels.length === 0}
                            title={`Alle Zeilen auf ${ROW_HEIGHT_EXPANDED}px, Tab: TARS in IDE · IDE project summary`}
                            onClick={() => applyBulkChannelRows(ROW_HEIGHT_EXPANDED, 'summary')}
                        >
                            TARS in IDE, all
                        </button>
                    </div>
                )}

                <div className="header-actions" style={{ flexShrink: 0 }}>
                    <button onClick={handleExport}><Download size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> Export</button>
                    <button onClick={handleImport}><Upload size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> Import</button>
                    <button onClick={handleReload}><RefreshCw size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} /> Reload</button>
                    <button
                        type="button"
                        onClick={handleSave}
                        title="Refresh the view only — each edit is already persisted to disk automatically."
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Save size={16} /> Save
                    </button>
                    <button
                        type="button"
                        className={
                            channelPersistInFlight
                                ? 'primary'
                                : `primary${telegramPolicyDraft.applyOnOpenClawApply ? '' : ' apply-openclaw-partial'}${applyToOpenClawPending ? ' apply-openclaw-pending' : ''}`
                        }
                        disabled={channelPersistInFlight}
                        onClick={() => {
                            if (channelPersistInFlight) return;
                            setOpenClawApplyOpen(true);
                        }}
                        title={
                            channelPersistInFlight
                                ? 'Wait until all save operations finish…'
                                : applyToOpenClawPending
                                  ? 'Press to apply: Channel Manager changes differ from openclaw.json.'
                                  : telegramPolicyDraft.applyOnOpenClawApply
                                  ? APPLY_OPENCLAW_TITLE_WITH_TG_ACCOUNT
                                  : APPLY_OPENCLAW_TITLE_WITHOUT_TG_ACCOUNT
                        }
                    >
                        <FileJson2 size={14} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />
                        {applyToOpenClawPending ? 'Press to apply…' : applyPreviewFetching ? 'Checking Apply…' : 'Apply to OpenClaw…'}
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
            <OpenClawApplyModal
                open={openClawApplyOpen}
                onClose={() => {
                    setOpenClawApplyOpen(false);
                    queryClient.invalidateQueries({ queryKey: ['channels'] });
                    queryClient.invalidateQueries({ queryKey: APPLY_PREVIEW_QUERY_KEY });
                }}
                onBeforeApply={prepareApplyToOpenClaw}
                onApplied={clearApplyDirty}
                onNoChanges={clearApplyDirty}
            />
        </div>
    );
}
