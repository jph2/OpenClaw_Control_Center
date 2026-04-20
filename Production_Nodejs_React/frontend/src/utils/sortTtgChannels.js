/**
 * Extract leading topic index from TTG display names (TTG000_…, TG001_…).
 * @param {string | null | undefined} name
 * @returns {number} parsed index, or MAX_SAFE_INTEGER if no prefix
 */
function ttgNumericPrefix(name) {
    if (name == null || typeof name !== 'string') return Number.MAX_SAFE_INTEGER;
    const m = name.match(/^(?:TTG|TG)(\d+)/i);
    if (!m) return Number.MAX_SAFE_INTEGER;
    return parseInt(m[1], 10);
}

/**
 * Sort Channel Manager rows by TTG index (0, 1, 10, …), not lexicographically and not by raw API order.
 * Rows without a TTG### / TG### prefix sort after all numbered TTGs, then by name, then id.
 *
 * @param {Array<{ name?: string, id?: string }>} channels
 * @returns {Array<{ name?: string, id?: string }>}
 */
export function sortTtgChannels(channels) {
    if (!Array.isArray(channels) || channels.length === 0) return Array.isArray(channels) ? [...channels] : [];
    return [...channels].sort((a, b) => {
        const na = ttgNumericPrefix(a?.name);
        const nb = ttgNumericPrefix(b?.name);
        if (na !== nb) return na - nb;
        const cmpName = String(a?.name || '').localeCompare(String(b?.name || ''));
        if (cmpName !== 0) return cmpName;
        return String(a?.id || '').localeCompare(String(b?.id || ''));
    });
}
