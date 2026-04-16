import React, { Fragment, useLayoutEffect, useRef, useState } from 'react';
import TelegramChat from './TelegramChat';
import IdeProjectSummaryPanel from './IdeProjectSummaryPanel';
import ActiveBotsList from './ActiveBotsList';
import { formatSkillOptionLabel } from '../utils/formatSkillOptionLabel.js';
import { formatTtgChannelName } from '../utils/formatTtgChannelName.js';

const TAB_IDE_SUMMARY_LABEL = 'TARS in IDE · IDE project summary';

export default function ChannelManagerChannelRow({
    tg,
    channelState,
    rowHeights,
    setRowHeights,
    rowSubtabs,
    setRowSubtabs,
    selectedChannels,
    handleToggleSelect,
    MAIN_AGENTS,
    SKILL_METADATA,
    AVAILABLE_MODELS,
    backendAgents,
    backendSubAgents,
    navigateToAgent,
    handleUpdateChannel,
    handleAddSkill,
    handleRemoveSkill,
    handleToggleSkill,
    handleToggleAgentSkill,
    handleToggleSubAgentSkill,
    handleSubAgentToggle,
    onSubAgentUnassignParent,
    onSubAgentAssignToTars,
    /** Same px as header bulk actions (ChannelManager). */
    rowHeightExpanded = 1010,
    rowHeightCollapsed = 260
}) {
    /** UI policy (16.04.2026): primary engine is always TARS; MARVIN/CASE are harness personas (conversation), not per-channel engine picks. */
    const assignedAgentKey = 'tars';
    const agentDetails = MAIN_AGENTS.tars || MAIN_AGENTS[Object.keys(MAIN_AGENTS)[0]];
    /** Catalog defaults for IDE relay skills (stored as `caseSkills` in config). */
    const ideRelayCatalog = MAIN_AGENTS.case || {};
    const ideRelayDefaults = ideRelayCatalog.defaultSkills || [];

    const activeSubAgents = backendSubAgents.filter(
        (sub) =>
            sub.parent === assignedAgentKey &&
            sub.enabled !== false &&
            !(channelState.inactiveSubAgents || []).includes(sub.id)
    );
    const subAgentSkills = activeSubAgents.flatMap((sub) =>
        (sub.additionalSkills || []).map((s) => ({ id: s, subId: sub.id }))
    );
    const agentSkills = agentDetails.defaultSkills || [];

    // One UI row per carrier: channel (deduped), each (subAgent × skill) pair, each main-agent default skill.
    // Same skill id may appear on multiple rows (e.g. TARS + two subs all use `research`).
    const allChannelSkills = [];
    const channelSeen = new Set();
    (channelState.skills || []).forEach((s) => {
        if (!channelSeen.has(s)) {
            channelSeen.add(s);
            allChannelSkills.push({ id: s, source: 'channel' });
        }
    });
    activeSubAgents.forEach((sub) => {
        (sub.additionalSkills || []).forEach((skillId) => {
            allChannelSkills.push({ id: skillId, source: 'sub', subId: sub.id });
        });
    });
    (agentSkills || []).forEach((s) => {
        allChannelSkills.push({ id: s, source: 'agent' });
    });

    const subTab = rowSubtabs[tg.id] || 'config';
    const rowH = rowHeights[tg.id] || 450;

    const expandThisSegment = () => {
        setRowHeights((prev) => ({ ...prev, [tg.id]: rowHeightExpanded }));
        queueMicrotask(() => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const el = segmentFooterRef.current;
                    if (!el) return;
                    el.scrollIntoView({ block: 'end', behavior: 'smooth', inline: 'nearest' });
                });
            });
        });
    };

    const collapseThisSegment = () => {
        setRowHeights((prev) => ({ ...prev, [tg.id]: rowHeightCollapsed }));
        setRowSubtabs((prev) => ({ ...prev, [tg.id]: 'config' }));
    };

    const leftColRef = useRef(null);
    const tarsRelayRef = useRef(null);
    /** Footer row (Open/Collapse + resize): scroll into view after expand so it sits at bottom of viewport. */
    const segmentFooterRef = useRef(null);
    const [dividerTop, setDividerTop] = useState(null);

    const syncDividerEnabled = subTab === 'config';

    useLayoutEffect(() => {
        if (!syncDividerEnabled) {
            setDividerTop(null);
            return;
        }
        const measure = () => {
            const L = leftColRef.current;
            const T = tarsRelayRef.current;
            if (!L || !T) {
                setDividerTop(null);
                return;
            }
            setDividerTop(Math.round(T.getBoundingClientRect().top - L.getBoundingClientRect().top));
        };
        measure();
        const ro = new ResizeObserver(() => measure());
        if (leftColRef.current) ro.observe(leftColRef.current);
        if (tarsRelayRef.current) ro.observe(tarsRelayRef.current);
        window.addEventListener('resize', measure);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [
        syncDividerEnabled,
        tg.id,
        rowH,
        subTab,
        allChannelSkills.length,
        (channelState.caseSkills || []).length,
        (channelState.inactiveCaseSkills || []).length,
        assignedAgentKey
    ]);

    const renderLeftSidebar = () => {
        const chInactive = channelState.inactiveSubAgents || [];

        const renderSubAgentBlock = (blockKey) => {
            const assignedTars = (s) => s.parent === assignedAgentKey && s.enabled !== false;
            const addable = backendSubAgents.filter((s) => {
                if (s.enabled === false) return false;
                if (assignedTars(s) && !chInactive.includes(s.id)) return false;
                return true;
            });
            return (
                <div
                    key={blockKey}
                    style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}
                >
                    {backendSubAgents.filter(assignedTars).map((sub) => {
                        const subId = sub.id;
                        const isSubActive = !chInactive.includes(subId);
                        return (
                            <div
                                key={`${blockKey}-${subId}`}
                                className={`skill-item ${isSubActive ? 'active' : ''}`}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
                                    alignItems: 'center',
                                    gap: '8px',
                                    width: '100%',
                                    padding: '6px 8px',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    background: 'var(--bg-elevated)',
                                    boxSizing: 'border-box'
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={isSubActive}
                                    onChange={() => handleSubAgentToggle(tg.id, subId, chInactive)}
                                    style={{ cursor: 'pointer', margin: 0 }}
                                />
                                <span
                                    onClick={(e) => {
                                        e.preventDefault();
                                        navigateToAgent(subId);
                                    }}
                                    style={{ cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600, fontSize: '12px' }}
                                >
                                    {sub.name || subId}
                                </span>
                                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                                    +{(sub.additionalSkills || []).length} skills
                                </span>
                                <button
                                    type="button"
                                    title="Remove sub-agent from main agent (all channels)"
                                    onClick={() => onSubAgentUnassignParent?.(subId)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        padding: '0 4px',
                                        fontSize: '14px',
                                        lineHeight: 1
                                    }}
                                >
                                    x
                                </button>
                            </div>
                        );
                    })}
                    <select
                        value=""
                        onChange={(e) => {
                            const sid = e.target.value;
                            if (!sid) return;
                            e.target.value = '';
                            const sub = backendSubAgents.find((x) => x.id === sid);
                            if (!sub) return;
                            if (sub.parent !== assignedAgentKey) {
                                onSubAgentAssignToTars?.(sid);
                                if (chInactive.includes(sid)) {
                                    handleUpdateChannel(
                                        tg.id,
                                        'inactiveSubAgents',
                                        chInactive.filter((x) => x !== sid)
                                    );
                                }
                            } else {
                                handleSubAgentToggle(tg.id, sid, chInactive);
                            }
                        }}
                        style={{
                            width: '100%',
                            marginTop: '4px',
                            padding: '6px 8px',
                            background: '#13141c',
                            border: '1px solid var(--border-color)',
                            borderRadius: '4px',
                            color: 'var(--text-secondary)',
                            fontSize: '11px',
                            outline: 'none'
                        }}
                    >
                        <option value="">+ add subagent</option>
                        {addable.map((s) => (
                            <option key={`${blockKey}-opt-${s.id}`} value={s.id}>
                                {s.name || s.id}
                                {s.parent && s.parent !== assignedAgentKey ? ` (${s.parent})` : ''}
                                {!s.parent ? ' (unassigned)' : ''}
                            </option>
                        ))}
                    </select>
                </div>
            );
        };

        const topBlock = (
            <>
                <div className="tg-name" title={tg.name || tg.id}>
                    {formatTtgChannelName(tg.name) || tg.name || tg.id}
                </div>
                <div className="tg-id">{tg.id}</div>
                <div className={`status-badge ${tg.status}`} style={{ width: 'fit-content', marginTop: '8px' }}>
                    <div className="status-dot"></div> {tg.status}
                </div>
                <div className="current-task" style={{ marginBottom: '16px' }}>
                    {tg.currentTask}
                </div>

                <div
                    style={{
                        width: '100%',
                        marginBottom: '4px',
                        padding: '6px 8px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--text-primary)'
                    }}
                >
                    {agentDetails.name}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '10px' }}>{agentDetails.role}</div>
                <div
                    onClick={() => navigateToAgent('tars')}
                    style={{
                        fontSize: '10px',
                        color: agentDetails.color,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        marginBottom: '16px',
                        display: 'inline-block'
                    }}
                >
                    {agentDetails.name} konfigurieren ➔
                </div>

                <div style={{ marginTop: '8px', marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Sub-agents
                </div>
                {renderSubAgentBlock('planner')}
            </>
        );

        if (!syncDividerEnabled) {
            return (
                <div className="tg-group" style={{ height: `${rowH}px`, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
                    {topBlock}
                    <div style={{ marginTop: 'auto', paddingBottom: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div
                            style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: 'var(--text-secondary)',
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase'
                            }}
                        >
                            TARS in IDE
                        </div>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            Sub-agents
                        </div>
                        {renderSubAgentBlock('ide')}
                        <ActiveBotsList chatId={tg.id} />
                    </div>
                </div>
            );
        }

        const dt = dividerTop ?? Math.floor(rowH * 0.52);

        return (
            <div
                ref={leftColRef}
                className="tg-group"
                style={{ height: `${rowH}px`, position: 'relative', boxSizing: 'border-box', display: 'block' }}
            >
                <div
                    style={{
                        maxHeight: Math.max(0, dt - 8),
                        overflowY: 'auto',
                        paddingRight: '4px',
                        paddingBottom: '8px',
                        boxSizing: 'border-box'
                    }}
                >
                    {topBlock}
                </div>
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: dt,
                        height: 0,
                        borderTop: '1px solid var(--border-color)',
                        margin: 0,
                        pointerEvents: 'none'
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: dt + 1,
                        bottom: 0,
                        overflow: 'auto',
                        paddingTop: '10px',
                        boxSizing: 'border-box'
                    }}
                >
                    <div
                        style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            marginBottom: '6px'
                        }}
                    >
                        TARS in IDE
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Sub-agents</div>
                    {renderSubAgentBlock('ide')}
                    <ActiveBotsList chatId={tg.id} suppressTopBorder />
                </div>
            </div>
        );
    };

    const rowBg = selectedChannels.includes(tg.id) ? 'rgba(255,255,255,0.05)' : 'transparent';

    return (
        <Fragment>
        <tr
            style={{
                background: rowBg
            }}
        >
            <td style={{ borderLeft: `2px solid ${agentDetails.color || 'transparent'}`, width: '40px', textAlign: 'center' }}>
                <input
                    type="checkbox"
                    checked={selectedChannels.includes(tg.id)}
                    onChange={() => handleToggleSelect(tg.id)}
                    style={{ cursor: 'pointer', transform: 'scale(1.2)' }}
                />
            </td>

            <td style={{ width: '250px', verticalAlign: 'top' }}>{renderLeftSidebar()}</td>

            <td style={{ padding: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', height: `${rowH}px`, borderLeft: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    <div className="row-tabs" style={{ flexShrink: 0 }}>
                        <button
                            type="button"
                            className={`row-tab ${subTab === 'config' ? 'active' : ''}`}
                            onClick={() => setRowSubtabs({ ...rowSubtabs, [tg.id]: 'config' })}
                        >
                            Configuration
                        </button>
                        <button
                            type="button"
                            className={`row-tab ${subTab === 'chat' ? 'active' : ''}`}
                            onClick={() => setRowSubtabs({ ...rowSubtabs, [tg.id]: 'chat' })}
                        >
                            OpenClaw Chat
                        </button>
                        <button
                            type="button"
                            className={`row-tab ${subTab === 'summary' ? 'active' : ''}`}
                            onClick={() => setRowSubtabs({ ...rowSubtabs, [tg.id]: 'summary' })}
                            title="IDE project summaries (tool-agnostic)"
                            style={{ fontSize: '11px', lineHeight: 1.25, padding: '8px 12px' }}
                        >
                            {TAB_IDE_SUMMARY_LABEL}
                        </button>
                    </div>

                    {subTab === 'config' && (
                        <div style={{ display: 'flex', padding: '16px', gap: '20px', height: '100%', boxSizing: 'border-box' }}>
                            <div className="skills-cell" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>SKILLS</div>
                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '8px' }}>
                                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                        {allChannelSkills.length} ROWS (DEFAULT: {agentSkills.length}, SUB-PAIRS: {subAgentSkills.length}, CHANNEL:{' '}
                                        {(channelState.skills || []).length})
                                    </div>
                                    <select
                                        onChange={(e) => {
                                            if (e.target.value) {
                                                handleAddSkill(tg.id, e.target.value);
                                                e.target.value = '';
                                            }
                                        }}
                                        style={{
                                            padding: '4px',
                                            background: 'var(--bg-elevated)',
                                            color: 'white',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            flex: 1,
                                            outline: 'none'
                                        }}
                                    >
                                        <option value="">+ Add channel skill...</option>
                                        {Object.keys(SKILL_METADATA).map((s) => (
                                            <option key={s} value={s} title={SKILL_METADATA[s]?.desc || s}>
                                                {formatSkillOptionLabel(s, SKILL_METADATA[s]?.desc)}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="skills-list" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                                    {allChannelSkills.map((skill, skillRowIdx) => {
                                        let badge = 'CHANNEL SKILL';
                                        if (skill.source === 'agent') badge = 'INHERITED BY AGENT';
                                        if (skill.source === 'sub') {
                                            const subMeta = backendSubAgents.find((x) => x.id === skill.subId);
                                            const subLabel = (subMeta?.name || skill.subId || 'sub-agent').trim();
                                            badge = `Inherited from sub-agent · ${subLabel}`;
                                        }

                                        const isChannelSkill = skill.source === 'channel';

                                        let isInactive = false;
                                        if (skill.source === 'channel') {
                                            isInactive = (channelState.inactiveSkills || []).includes(skill.id);
                                        } else if (skill.source === 'agent') {
                                            const ag = backendAgents.find((a) => a.id === 'tars');
                                            if (ag && (ag.inactiveSkills || []).includes(skill.id)) isInactive = true;
                                        } else if (skill.source === 'sub') {
                                            const sub = backendSubAgents.find((s) => s.id === skill.subId);
                                            if (sub && (sub.inactiveSkills || []).includes(skill.id)) isInactive = true;
                                        }

                                        const rowKey = `skill-${skill.source}-${skill.subId ?? 'tars'}-${skill.id}-${skillRowIdx}`;

                                        return (
                                            <div
                                                key={rowKey}
                                                className={`skill-item ${!isInactive ? 'active' : ''}`}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'auto auto auto 1fr auto auto',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    width: '100%'
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={!isInactive}
                                                    onChange={() => {
                                                        if (skill.source === 'channel') handleToggleSkill(tg.id, skill.id);
                                                        else if (skill.source === 'agent')
                                                            handleToggleAgentSkill('tars', skill.id);
                                                        else if (skill.source === 'sub')
                                                            handleToggleSubAgentSkill(skill.subId, skill.id);
                                                    }}
                                                    style={{ flexShrink: 0, margin: 0 }}
                                                />
                                                <span className="skill-name" style={{ whiteSpace: 'nowrap' }}>
                                                    {skill.id}
                                                </span>
                                                <span className="skill-separator" style={{ color: 'var(--text-secondary)' }}>
                                                    |
                                                </span>
                                                <span className="skill-desc" style={{ lineHeight: '1.4', paddingRight: '12px', minWidth: 0, overflow: 'hidden' }}>
                                                    {SKILL_METADATA[skill.id]?.desc || ''}
                                                </span>
                                                <span
                                                    style={{
                                                        fontSize: '9px',
                                                        color: isChannelSkill ? 'var(--text-secondary)' : agentDetails.color,
                                                        textTransform: 'uppercase',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                >
                                                    {badge}
                                                </span>
                                                {isChannelSkill ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveSkill(tg.id, skill.id)}
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
                                                ) : (
                                                    <div />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div
                                    ref={tarsRelayRef}
                                    style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}
                                >
                                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                            TARS in IDE
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '8px' }}>
                                            <div
                                                style={{
                                                    fontSize: '10px',
                                                    color: 'var(--text-secondary)',
                                                    textTransform: 'uppercase',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                {ideRelayDefaults.length + (channelState.caseSkills || []).length}{' '}
                                                SKILLS (DEFAULT: {ideRelayDefaults.length}, ADDED: {(channelState.caseSkills || []).length})
                                            </div>
                                            <select
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        const currentCaseSkills = channelState.caseSkills || [];
                                                        if (!currentCaseSkills.includes(e.target.value)) {
                                                            handleUpdateChannel(tg.id, 'caseSkills', [...currentCaseSkills, e.target.value]);
                                                        }
                                                        e.target.value = '';
                                                    }
                                                }}
                                                style={{
                                                    padding: '4px',
                                                    background: 'var(--bg-elevated)',
                                                    color: 'white',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    flex: 1,
                                                    outline: 'none'
                                                }}
                                            >
                                                <option value="">+ Add channel skill...</option>
                                                {Object.keys(SKILL_METADATA).map((s) => (
                                                    <option key={s} value={s} title={SKILL_METADATA[s]?.desc || s}>
                                                        {formatSkillOptionLabel(s, SKILL_METADATA[s]?.desc)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="skills-list">
                                            {[...ideRelayDefaults, ...(channelState.caseSkills || [])].map(
                                                (skillId) => {
                                                    const isInactive = (channelState.inactiveCaseSkills || []).includes(skillId);
                                                    const isDefault = ideRelayDefaults.includes(skillId);
                                                    const badge = isDefault ? 'INHERITED BY AGENT' : 'IDE RELAY SKILL';
                                                    return (
                                                        <div
                                                            key={`case_${skillId}`}
                                                            className={`skill-item ${!isInactive ? 'active' : ''}`}
                                                            style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: 'auto auto auto 1fr auto auto',
                                                                alignItems: 'center',
                                                                gap: '12px',
                                                                width: '100%'
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={!isInactive}
                                                                onChange={() => {
                                                                    const current = channelState.inactiveCaseSkills || [];
                                                                    if (current.includes(skillId)) {
                                                                        handleUpdateChannel(
                                                                            tg.id,
                                                                            'inactiveCaseSkills',
                                                                            current.filter((id) => id !== skillId)
                                                                        );
                                                                    } else {
                                                                        handleUpdateChannel(tg.id, 'inactiveCaseSkills', [...current, skillId]);
                                                                    }
                                                                }}
                                                                style={{ flexShrink: 0, margin: 0 }}
                                                            />
                                                            <span className="skill-name" style={{ whiteSpace: 'nowrap' }}>
                                                                {skillId}
                                                            </span>
                                                            <span className="skill-separator" style={{ color: 'var(--text-secondary)' }}>
                                                                |
                                                            </span>
                                                            <span className="skill-desc" style={{ lineHeight: '1.4', paddingRight: '12px', minWidth: 0, overflow: 'hidden' }}>
                                                                {SKILL_METADATA[skillId]?.desc || ''}
                                                            </span>
                                                            <span
                                                                style={{
                                                                    fontSize: '9px',
                                                                    color: ideRelayCatalog.color || '#e3c450',
                                                                    textTransform: 'uppercase',
                                                                    whiteSpace: 'nowrap'
                                                                }}
                                                            >
                                                                {badge}
                                                            </span>
                                                            {!isDefault ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const current = channelState.caseSkills || [];
                                                                        handleUpdateChannel(
                                                                            tg.id,
                                                                            'caseSkills',
                                                                            current.filter((id) => id !== skillId)
                                                                        );
                                                                    }}
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
                                                            ) : (
                                                                <div />
                                                            )}
                                                        </div>
                                                    );
                                                }
                                            )}
                                        </div>
                                    </div>
                            </div>

                            <div className="model-cell" style={{ width: '250px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                    MODEL SETTINGS
                                </div>

                                <div className="model-list">
                                    {AVAILABLE_MODELS.map((model) => (
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
                                                <span
                                                    className="model-desc"
                                                    style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                >
                                                    {model.desc}
                                                </span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {subTab === 'chat' && (
                        <div style={{ flex: 1, width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div
                                style={{
                                    fontSize: '10px',
                                    color: 'var(--text-secondary)',
                                    padding: '6px 10px',
                                    borderBottom: '1px solid var(--border-color)'
                                }}
                            >
                                Same transcript stream as the OpenClaw gateway (SSE); not a second send path.
                            </div>
                            <div style={{ flex: 1, minHeight: 0 }}>
                                <TelegramChat channelId={tg.id} channelName={formatTtgChannelName(tg.name) || tg.name} />
                            </div>
                        </div>
                    )}
                    {subTab === 'summary' && (
                        <div style={{ flex: 1, width: '100%', overflow: 'hidden' }}>
                            <IdeProjectSummaryPanel channelId={tg.id} channelName={formatTtgChannelName(tg.name) || tg.name} />
                        </div>
                    )}
                </div>
            </td>
        </tr>
        <tr
            style={{
                borderBottom: '3px solid rgba(255, 255, 255, 0.1)',
                background: rowBg
            }}
        >
            <td colSpan={3} style={{ padding: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <div
                        ref={segmentFooterRef}
                        style={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            flexShrink: 0,
                            borderTop: '1px solid var(--border-color)',
                            background: 'rgba(26, 27, 38, 0.95)',
                            scrollMarginBottom: '12px'
                        }}
                    >
                        <button
                            type="button"
                            title={`Segment auf ${rowHeightExpanded}px (wie „Configure all“)`}
                            onClick={expandThisSegment}
                        >
                            Open
                        </button>
                        <button
                            type="button"
                            title={`Segment auf ${rowHeightCollapsed}px; Tab Configuration (wie „Collapse all“)`}
                            onClick={collapseThisSegment}
                        >
                            Collapse
                        </button>
                    </div>
                    <div
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const startY = e.clientY;
                            const startH = rowHeights[tg.id] || 450;
                            const onMove = (me) =>
                                setRowHeights((prev) => ({
                                    ...prev,
                                    [tg.id]: Math.max(200, startH + (me.clientY - startY))
                                }));
                            const onUp = () => {
                                document.removeEventListener('mousemove', onMove);
                                document.removeEventListener('mouseup', onUp);
                            };
                            document.addEventListener('mousemove', onMove);
                            document.addEventListener('mouseup', onUp);
                        }}
                        style={{
                            width: '100%',
                            height: '8px',
                            cursor: 'row-resize',
                            background: 'var(--border-color)',
                            borderBottom: '1px solid #111',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#444';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--border-color)';
                        }}
                    >
                        <div style={{ width: '30px', height: '4px', background: 'var(--text-secondary)', borderRadius: '2px' }} />
                    </div>
                </div>
            </td>
        </tr>
        </Fragment>
    );
}
