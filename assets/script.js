/**
 * JL-Mod Skins Database v3.0
 * Tabs: Skins (cards/*.json) · Translations (tl/*.jar)
 */
(function () {
    'use strict';

    const CONFIG = {
        ITEMS_PER_PAGE: 12,
        BATCH_SIZE: 6,
        DEBOUNCE_MS: 250,
        LAZY_THRESHOLD: '80px',
        NEW_WINDOW_MS: 14 * 24 * 60 * 60 * 1000,
        // Optional: set this if the site is NOT hosted on GitHub Pages but the files are on GitHub.
        // e.g. { owner: 'yourname', repo: 'jlskindb', branch: 'main' }
        GITHUB: null,
    };

    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const els = {
        searchInput: $('#searchInput'),
        tabs: $$('.tab'),
        panelSkins: $('#panelSkins'),
        panelTl: $('#panelTl'),
        countSkins: $('#countSkins'),
        countTl: $('#countTl'),
        // skins
        skinsGrid: $('#skinsGrid'),
        loadMoreWrap: $('#loadMoreWrap'),
        loadMoreBtn: $('#loadMoreBtn'),
        loadMoreCount: $('#loadMoreCount'),
        emptyState: $('#emptyState'),
        errorState: $('#errorState'),
        statsSkins: $('#statsSkins'),
        resetEmpty: $('#resetEmpty'),
        retryLoad: $('#retryLoad'),
        filterOrientation: $('#filterOrientation'),
        filterCategory: $('#filterCategory'),
        filterResolution: $('#filterResolution'),
        filterSort: $('#filterSort'),
        // tl
        tlBody: $('#tlBody'),
        tlTable: $('#tlTable'),
        statsTl: $('#statsTl'),
        tlEmpty: $('#tlEmpty'),
        tlNone: $('#tlNone'),
        tlError: $('#tlError'),
        tlRetry: $('#tlRetry'),
        tlResetEmpty: $('#tlResetEmpty'),
        tlFilterResolution: $('#tlFilterResolution'),
        tlFilterSort: $('#tlFilterSort'),
        // shared chrome
        filterToggle: $('#filterToggle'),
        filterPanel: $('#filterPanel'),
        filterDot: $('#filterDot'),
        filterCount: $('#filterCount'),
        resetFilters: $('#resetFilters'),
        moreMenuToggle: $('#moreMenuToggle'),
        moreMenu: $('#moreMenu'),
        viewToggle: $('#viewToggle'),
        viewToggleText: $('#viewToggleText'),
        themeToggle: $('#themeToggle'),
        themeToggleText: $('#themeToggleText'),
        repoLink: $('#repoLink'),
        modalOverlay: $('#modalOverlay'),
        modalSheet: $('#modalSheet'),
        modalImage: $('#modalImage'),
        modalBody: $('#modalBody'),
        modalClose: $('#modalClose'),
        backToTop: $('#backToTop'),
        toastContainer: $('#toastContainer'),
    };

    const state = {
        tab: 'skins',
        search: '',
        view: 'grid',
        skins: { all: [], filtered: [], map: new Map(), page: 1, loading: false, loaded: false,
                 filters: { orientation: 'all', category: 'all', resolution: 'all', sort: 'newest' } },
        tl:    { all: [], filtered: [], loading: false, loaded: false,
                 filters: { resolution: 'all', sort: 'newest' } },
    };

    let searchTimer = null;
    let lastFocused = null;

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------
    const esc = (str) => String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const placeholderSVG = () =>
        `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='250'%3E%3Crect fill='%23252535' width='400' height='250'/%3E%3Ctext fill='%235a5a6a' x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-family='sans-serif' font-size='14'%3ENo preview%3C/text%3E%3C/svg%3E`;

    function isNew(dateStr, flag) {
        if (flag) return true;
        if (!dateStr) return false;
        const t = new Date(dateStr).getTime();
        return !Number.isNaN(t) && Date.now() - t < CONFIG.NEW_WINDOW_MS;
    }

    function fmtDate(str) {
        if (!str) return '—';
        const d = new Date(str);
        return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function fmtSize(bytes) {
        if (!bytes && bytes !== 0) return '—';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    }

    function byDate(a, b, dir) {
        const ta = new Date(a || 0).getTime() || 0;
        const tb = new Date(b || 0).getTime() || 0;
        return dir === 'desc' ? tb - ta : ta - tb;
    }

    function showToast(message, duration = 2500) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = message;
        els.toastContainer.appendChild(t);
        setTimeout(() => {
            t.classList.add('toast-out');
            t.addEventListener('animationend', () => t.remove(), { once: true });
        }, duration);
    }

    function isExternal(url) {
        return !url || url === '#' || /^https?:\/\//i.test(url);
    }

    function fillSelect(select, values, keepValue) {
        const current = keepValue ? select.value : 'all';
        select.innerHTML = '<option value="all">All</option>' +
            values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
        select.value = values.includes(current) ? current : 'all';
    }

    // Sort resolutions like 240x320 numerically (by width, then height)
    function sortRes(list) {
        return [...list].sort((a, b) => {
            const [aw, ah] = a.split('x').map(Number);
            const [bw, bh] = b.split('x').map(Number);
            return (aw - bw) || (ah - bh);
        });
    }

    // Infer GitHub owner/repo when hosted on GitHub Pages
    function githubInfo() {
        if (CONFIG.GITHUB) return CONFIG.GITHUB;
        const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
        if (!m) return null;
        const owner = m[1];
        const seg = location.pathname.split('/').filter(Boolean)[0];
        return { owner, repo: seg || `${owner}.github.io`, branch: 'main' };
    }

    // ------------------------------------------------------------------
    // Jar filename parser
    //   "Title-240x320.jar"
    //   "Title-Nokia N73-240x320.jar" / "Title_N73_240x320.jar" / "Title 240x320.jar"
    //   "Title-240x320-SE K800.jar"
    // ------------------------------------------------------------------
    const RES_RE = /(\d{2,4})\s*[x×X*]\s*(\d{2,4})/;
    const RES_TOKEN = '\u0000';
    const BRANDS = new Set(['nokia', 'sony', 'ericsson', 'se', 'sonyericsson', 'samsung', 'lg', 'motorola', 'moto', 'siemens',
        'htc', 'blackberry', 'bb', 'touch', 'touchscreen', 'ts', 'keypad', 'symbian', 's40', 's60', 'android', 'landscape', 'portrait']);

    // Looks like a phone brand/model? (Nokia, N73, K800i, W810, 5130 … but not years like 2010)
    function isDeviceWord(w) {
        const s = w.toLowerCase();
        if (BRANDS.has(s)) return true;
        if (/^[a-z]{1,2}\d{2,4}[a-z]{0,2}$/i.test(w)) return true;
        if (/^\d{4}[a-z]?$/i.test(w) && !/^(19|20)\d\d/.test(w)) return true;
        return false;
    }

    function parseJarName(filename) {
        const base = filename.replace(/\.(jar|jad|zip)$/i, '').trim();
        const m = base.match(RES_RE);
        const resolution = m ? `${m[1]}x${m[2]}` : '';
        const norm = m ? base.replace(m[0], ` ${RES_TOKEN} `) : base;
        const words = (s) => s.split(/[_\s]+/).filter(Boolean);

        let titleWords = [];
        let deviceWords = [];

        const segs = norm.split(/\s*-\s*/).map(s => s.trim()).filter(Boolean);
        if (segs.length >= 2) {
            // Dash-separated: "Title - Device - 240x320" (any order after the title)
            let seenRes = false;
            segs.forEach((seg, i) => {
                const w = words(seg);
                if (w.includes(RES_TOKEN)) {
                    seenRes = true;
                    deviceWords.push(...w.filter(x => x !== RES_TOKEN));
                } else if (i > 0 && (seenRes || w.some(isDeviceWord))) {
                    deviceWords.push(...w);
                } else {
                    titleWords.push(...w);   // "Bounce-Tales" → part of the title
                }
            });
        } else {
            // Underscore / space separated: title words, then optional device words, then resolution, then extras
            const w = words(norm);
            const ri = w.indexOf(RES_TOKEN);
            const before = ri === -1 ? w : w.slice(0, ri);
            const after = ri === -1 ? [] : w.slice(ri + 1);
            while (before.length > 1 && isDeviceWord(before[before.length - 1])) deviceWords.unshift(before.pop());
            titleWords = before;
            deviceWords.push(...after);
        }

        if (!titleWords.length) titleWords = deviceWords.splice(0);
        return {
            title: titleWords.join(' ') || base,
            device: deviceWords.join(' '),
            resolution,
        };
    }

    // ------------------------------------------------------------------
    // Tabs
    // ------------------------------------------------------------------
    function setTab(tab, { push = true } = {}) {
        if (tab !== 'skins' && tab !== 'tl') tab = 'skins';
        state.tab = tab;

        els.tabs.forEach(t => {
            const on = t.dataset.tab === tab;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on ? 0 : -1;
        });
        els.panelSkins.hidden = tab !== 'skins';
        els.panelTl.hidden = tab !== 'tl';
        $$('.filter-panel-inner').forEach(p => { p.hidden = p.dataset.for !== tab; });
        els.viewToggle.hidden = tab !== 'skins';
        els.searchInput.placeholder = tab === 'skins' ? 'Search skins…' : 'Search translations…';
        document.body.dataset.tab = tab;

        if (push) {
            const hash = tab === 'tl' ? '#tl' : '';
            if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
        }
        closeAllPanels();
        if (tab === 'tl' && !state.tl.loaded) loadTranslations();
        updateFilterCount();
    }

    function initTabs() {
        els.tabs.forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
        // Arrow-key navigation between tabs
        $('.tabs').addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const i = els.tabs.findIndex(t => t.classList.contains('active'));
            const next = els.tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + els.tabs.length) % els.tabs.length];
            setTab(next.dataset.tab);
            next.focus();
        });
        window.addEventListener('hashchange', () => setTab(location.hash === '#tl' ? 'tl' : 'skins', { push: false }));
        setTab(location.hash === '#tl' ? 'tl' : 'skins', { push: false });
    }

    // ------------------------------------------------------------------
    // Panels / menu
    // ------------------------------------------------------------------
    function setPanel(panel, trigger, open) {
        panel.hidden = !open;
        trigger.classList.toggle('active', open);
        trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function closeAllPanels() {
        setPanel(els.filterPanel, els.filterToggle, false);
        setPanel(els.moreMenu, els.moreMenuToggle, false);
    }
    function initPanels() {
        els.filterToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = els.filterPanel.hidden;
            closeAllPanels();
            setPanel(els.filterPanel, els.filterToggle, open);
        });
        els.moreMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = els.moreMenu.hidden;
            closeAllPanels();
            setPanel(els.moreMenu, els.moreMenuToggle, open);
        });
        document.addEventListener('click', (e) => {
            if (!els.filterPanel.contains(e.target) && !els.filterToggle.contains(e.target)) setPanel(els.filterPanel, els.filterToggle, false);
            if (!els.moreMenu.contains(e.target) && !els.moreMenuToggle.contains(e.target)) setPanel(els.moreMenu, els.moreMenuToggle, false);
        });
    }

    // ------------------------------------------------------------------
    // Lazy images
    // ------------------------------------------------------------------
    const lazyObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const img = entry.target;
            const src = img.dataset.src;
            if (src) {
                img.src = src;
                img.removeAttribute('data-src');
                img.onload = () => img.classList.add('loaded');
                img.onerror = () => { img.src = placeholderSVG(); img.classList.add('loaded'); };
            }
            lazyObserver.unobserve(img);
        });
    }, { rootMargin: CONFIG.LAZY_THRESHOLD });

    // ------------------------------------------------------------------
    // SKINS — load
    // ------------------------------------------------------------------
    async function loadSkins() {
        const S = state.skins;
        if (S.loading) return;
        S.loading = true;
        els.errorState.hidden = true;

        try {
            let res = await fetch('cards/index.json', { cache: 'no-cache' });
            if (!res.ok) res = await fetch('cards/_index.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error('index missing');
            const { cards = [] } = await res.json();

            const loaded = [];
            for (let i = 0; i < cards.length; i += CONFIG.BATCH_SIZE) {
                const batch = cards.slice(i, i + CONFIG.BATCH_SIZE);
                const results = await Promise.all(batch.map(async (f) => {
                    try {
                        const r = await fetch(`cards/${f}`);
                        if (!r.ok) return null;
                        const card = await r.json();
                        card.id = card.id || f.replace(/\.json$/, '');
                        card._file = f;
                        return card;
                    } catch { return null; }
                }));
                loaded.push(...results.filter(Boolean));
            }

            S.all = loaded;
            S.map = new Map(loaded.map(s => [s.id, s]));
            S.loaded = true;

            const resolutions = sortRes([...new Set(loaded.map(s => s.resolution).filter(r => /^\d+x\d+$/.test(r || '')))]);
            fillSelect(els.filterResolution, resolutions, true);

            $$('.skin-card.skeleton', els.skinsGrid).forEach(el => el.remove());
            els.countSkins.textContent = loaded.length;
            applySkinFilters();
        } catch (err) {
            console.error('Skins load error:', err);
            els.skinsGrid.innerHTML = '';
            els.errorState.hidden = false;
            els.statsSkins.textContent = '';
        } finally {
            S.loading = false;
        }
    }

    // ------------------------------------------------------------------
    // SKINS — filter / render
    // ------------------------------------------------------------------
    function applySkinFilters() {
        const S = state.skins;
        const { orientation, category, resolution, sort } = S.filters;
        const q = state.search.toLowerCase().trim();

        let results = S.all.filter(skin => {
            const hay = [skin.title, skin.author, skin.resolution, skin.description, ...(skin.tags || [])].join(' ').toLowerCase();
            return (!q || hay.includes(q)) &&
                (orientation === 'all' || skin.orientation === orientation || skin.orientation === 'both') &&
                (category === 'all' || skin.category === category) &&
                (resolution === 'all' || skin.resolution === resolution);
        });

        results.sort((a, b) => {
            switch (sort) {
                case 'newest': return byDate(a.dateAdded, b.dateAdded, 'desc') || (a.title || '').localeCompare(b.title || '');
                case 'oldest': return byDate(a.dateAdded, b.dateAdded, 'asc') || (a.title || '').localeCompare(b.title || '');
                case 'name-asc': return (a.title || '').localeCompare(b.title || '');
                case 'name-desc': return (b.title || '').localeCompare(a.title || '');
                default: return 0;
            }
        });

        S.filtered = results;
        S.page = 1;
        renderSkins();
    }

    function renderSkins() {
        const S = state.skins;
        const toShow = S.filtered.slice(0, S.page * CONFIG.ITEMS_PER_PAGE);

        // Full re-render keeps sort order correct
        els.skinsGrid.innerHTML = '';
        if (S.filtered.length === 0) {
            els.emptyState.hidden = S.all.length === 0;   // only "no match" when there is data
            els.loadMoreWrap.hidden = true;
            updateSkinStats();
            return;
        }
        els.emptyState.hidden = true;

        const frag = document.createDocumentFragment();
        toShow.forEach(skin => frag.appendChild(createSkinCard(skin)));
        els.skinsGrid.appendChild(frag);

        const remaining = S.filtered.length - toShow.length;
        els.loadMoreWrap.hidden = remaining <= 0;
        els.loadMoreCount.textContent = remaining > 0 ? `${remaining} more` : '';
        updateSkinStats();
    }

    function updateSkinStats() {
        const S = state.skins;
        if (!S.loaded) return;
        const total = S.all.length, showing = S.filtered.length;
        const fresh = S.all.filter(s => isNew(s.dateAdded, s.isNew)).length;
        const freshTxt = fresh ? ` · <strong>${fresh}</strong> new` : '';
        els.statsSkins.innerHTML = showing === total
            ? `<strong>${total}</strong> skin${total === 1 ? '' : 's'}${freshTxt}`
            : `<strong>${showing}</strong> of ${total} skins${freshTxt}`;
    }

    function createSkinCard(skin) {
        const el = document.createElement('article');
        el.className = 'skin-card';
        el.dataset.id = skin.id;
        el.setAttribute('role', 'listitem');
        el.tabIndex = 0;
        el.setAttribute('aria-label', `${skin.title} by ${skin.author}. Open details`);

        const ext = isExternal(skin.download);
        const tags = (skin.tags || [])
            .filter(t => t && t !== skin.resolution && t !== skin.orientation && t !== skin.category)
            .slice(0, 3);

        el.innerHTML = `
            <div class="skin-image-wrap">
                <img class="skin-image" data-src="${esc(skin.thumbnail || '')}" alt="" decoding="async">
                ${isNew(skin.dateAdded, skin.isNew) ? '<span class="new-badge">New</span>' : ''}
            </div>
            <div class="skin-info">
                <h3 class="skin-title">${esc(skin.title)}</h3>
                <p class="skin-author">${esc(skin.author || 'Unknown author')}</p>
                <div class="skin-specs">
                    ${skin.resolution ? `<span class="spec-tag spec-res">${esc(skin.resolution)}</span>` : ''}
                    ${skin.orientation ? `<span class="spec-tag">${esc(skin.orientation)}</span>` : ''}
                    ${tags.map(t => `<span class="spec-tag spec-muted">${esc(t)}</span>`).join('')}
                </div>
                <div class="skin-actions">
                    <a href="${esc(skin.download || '#')}" class="download-btn ${ext ? 'external' : ''}"
                       ${ext ? 'target="_blank" rel="noopener"' : 'download'}>
                        ${ext ? 'Open source' : 'Download'}
                    </a>
                </div>
            </div>`;

        const img = $('.skin-image[data-src]', el);
        if (img) lazyObserver.observe(img);

        $('.download-btn', el).addEventListener('click', e => e.stopPropagation());
        el.addEventListener('click', () => openModal(skin.id));
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(skin.id); }
        });
        return el;
    }

    function loadMore() {
        const S = state.skins;
        const firstNewIndex = S.page * CONFIG.ITEMS_PER_PAGE;
        S.page++;
        renderSkins();
        const card = els.skinsGrid.children[firstNewIndex];
        if (card) card.focus({ preventScroll: true }), card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ------------------------------------------------------------------
    // Modal
    // ------------------------------------------------------------------
    function openModal(id) {
        const skin = state.skins.map.get(id);
        if (!skin) return;
        lastFocused = document.activeElement;

        const ext = isExternal(skin.download);
        els.modalImage.classList.remove('loaded');
        els.modalImage.src = skin.thumbnail || placeholderSVG();
        els.modalImage.alt = `Preview of ${skin.title}`;
        els.modalImage.onload = () => els.modalImage.classList.add('loaded');
        els.modalImage.onerror = () => { els.modalImage.src = placeholderSVG(); els.modalImage.classList.add('loaded'); };

        const shareUrl = `${location.origin}${location.pathname}?skin=${encodeURIComponent(skin.id)}`;

        els.modalBody.innerHTML = `
            <div class="modal-head">
                <h2 id="modalTitle">${esc(skin.title)}</h2>
                ${isNew(skin.dateAdded, skin.isNew) ? '<span class="new-badge inline">New</span>' : ''}
            </div>
            <p class="modal-author">by ${esc(skin.author || 'Unknown')}${skin.category ? ` · ${esc(skin.category)}` : ''}${skin.dateAdded ? ` · added ${fmtDate(skin.dateAdded)}` : ''}</p>
            ${skin.description ? `<p class="modal-desc">${esc(skin.description)}</p>` : ''}
            <dl class="modal-meta">
                <div><dt>Resolution</dt><dd>${esc(skin.resolution || '—')}</dd></div>
                <div><dt>Orientation</dt><dd>${esc(skin.orientation || '—')}</dd></div>
                ${skin.tags?.length ? `<div class="wide"><dt>Tags</dt><dd>${skin.tags.map(t => `<span class="modal-tag">${esc(t)}</span>`).join('')}</dd></div>` : ''}
            </dl>
            <div class="modal-actions">
                <a href="${esc(skin.download || '#')}" class="modal-download" ${ext ? 'target="_blank" rel="noopener"' : 'download'}>
                    ${ext ? 'Open external source' : 'Download skin'}
                </a>
                <button class="modal-secondary" id="copyLink" type="button">Copy link</button>
            </div>`;

        $('#copyLink', els.modalBody).addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(shareUrl); showToast('Link copied'); }
            catch { showToast('Could not copy link'); }
        });

        els.modalOverlay.hidden = false;
        document.body.style.overflow = 'hidden';
        els.modalClose.focus();
    }

    function closeModal() {
        if (els.modalOverlay.hidden) return;
        els.modalOverlay.hidden = true;
        document.body.style.overflow = '';
        if (lastFocused?.focus) lastFocused.focus();
    }

    function trapFocus(e) {
        if (els.modalOverlay.hidden || e.key !== 'Tab') return;
        const focusable = $$('button, [href], input, select, [tabindex]:not([tabindex="-1"])', els.modalSheet).filter(el => !el.disabled);
        if (!focusable.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    // ------------------------------------------------------------------
    // TRANSLATIONS — load
    // ------------------------------------------------------------------
    async function loadTranslations() {
        const T = state.tl;
        if (T.loading) return;
        T.loading = true;
        els.tlError.hidden = true;
        els.tlNone.hidden = true;

        let files = null;
        try {
            const res = await fetch('tl/index.json', { cache: 'no-cache' });
            if (res.ok) {
                const data = await res.json();
                files = (data.files || []).map(f => ({ ...f, url: `tl/${encodeURIComponent(f.name)}` }));
            }
        } catch { /* fall through */ }

        // Fallback: read the folder straight from the GitHub API
        if (!files) {
            const gh = githubInfo();
            if (gh) {
                try {
                    const res = await fetch(`https://api.github.com/repos/${gh.owner}/${gh.repo}/contents/tl?ref=${gh.branch}`);
                    if (res.ok) {
                        const list = await res.json();
                        files = list
                            .filter(f => f.type === 'file' && /\.(jar|jad|zip)$/i.test(f.name))
                            .map(f => ({ name: f.name, size: f.size, date: '', url: f.download_url }));
                    }
                } catch { /* fall through */ }
            }
        }

        if (!files) {
            els.tlBody.innerHTML = '';
            els.tlError.hidden = false;
            els.statsTl.textContent = '';
            T.loading = false;
            return;
        }

        T.all = files.map(f => ({ ...f, ...parseJarName(f.name) }));
        T.loaded = true;
        T.loading = false;
        els.countTl.textContent = T.all.length;

        const resolutions = sortRes([...new Set(T.all.map(f => f.resolution).filter(Boolean))]);
        fillSelect(els.tlFilterResolution, resolutions, true);

        applyTlFilters();
    }

    function applyTlFilters() {
        const T = state.tl;
        const { resolution, sort } = T.filters;
        const q = state.search.toLowerCase().trim();

        let results = T.all.filter(f => {
            const hay = `${f.title} ${f.device} ${f.resolution} ${f.name}`.toLowerCase();
            return (!q || hay.includes(q)) && (resolution === 'all' || f.resolution === resolution);
        });

        results.sort((a, b) => {
            switch (sort) {
                case 'newest': return byDate(a.date, b.date, 'desc') || a.title.localeCompare(b.title);
                case 'oldest': return byDate(a.date, b.date, 'asc') || a.title.localeCompare(b.title);
                case 'name-asc': return a.title.localeCompare(b.title);
                case 'name-desc': return b.title.localeCompare(a.title);
                case 'size-asc': return (a.size || 0) - (b.size || 0);
                case 'size-desc': return (b.size || 0) - (a.size || 0);
                default: return 0;
            }
        });

        T.filtered = results;
        renderTl();
    }

    function renderTl() {
        const T = state.tl;
        els.tlBody.innerHTML = '';
        els.tlNone.hidden = T.all.length !== 0;
        els.tlEmpty.hidden = !(T.all.length > 0 && T.filtered.length === 0);
        els.tlTable.parentElement.hidden = T.filtered.length === 0;

        const frag = document.createDocumentFragment();
        T.filtered.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="col-title">
                    <span class="tl-title">${esc(f.title)}</span>
                    ${isNew(f.date) ? '<span class="new-badge inline">New</span>' : ''}
                    <span class="tl-file">${esc(f.name)}</span>
                </td>
                <td class="col-device">${f.device ? esc(f.device) : '<span class="muted">—</span>'}</td>
                <td class="col-res">${f.resolution ? `<span class="spec-tag spec-res">${esc(f.resolution)}</span>` : '<span class="muted">—</span>'}</td>
                <td class="col-size">${esc(fmtSize(f.size))}</td>
                <td class="col-date">${esc(fmtDate(f.date))}</td>
                <td class="col-dl"><a class="tl-download" href="${f.url}" download="${esc(f.name)}" aria-label="Download ${esc(f.name)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <span>Download</span></a></td>`;
            frag.appendChild(tr);
        });
        els.tlBody.appendChild(frag);

        const total = T.all.length, showing = T.filtered.length;
        els.statsTl.innerHTML = showing === total
            ? `<strong>${total}</strong> translated file${total === 1 ? '' : 's'}`
            : `<strong>${showing}</strong> of ${total} translated files`;
    }

    // ------------------------------------------------------------------
    // Filters (shared chrome)
    // ------------------------------------------------------------------
    function activeFilterCount() {
        const list = [];
        if (state.search) list.push('search');
        if (state.tab === 'skins') {
            const f = state.skins.filters;
            if (f.orientation !== 'all') list.push('orientation');
            if (f.category !== 'all') list.push('category');
            if (f.resolution !== 'all') list.push('resolution');
            if (f.sort !== 'newest') list.push('sort');
        } else {
            const f = state.tl.filters;
            if (f.resolution !== 'all') list.push('resolution');
            if (f.sort !== 'newest') list.push('sort');
        }
        return list.length;
    }

    function updateFilterCount() {
        const n = activeFilterCount();
        els.filterCount.textContent = n ? `${n} active` : 'No filters active';
        els.filterDot.hidden = n === 0;
    }

    function applyCurrent() {
        if (state.tab === 'skins') applySkinFilters(); else applyTlFilters();
        updateFilterCount();
    }

    function resetAllFilters() {
        state.search = '';
        els.searchInput.value = '';
        state.skins.filters = { orientation: 'all', category: 'all', resolution: 'all', sort: 'newest' };
        state.tl.filters = { resolution: 'all', sort: 'newest' };
        [els.filterOrientation, els.filterCategory, els.filterResolution, els.tlFilterResolution].forEach(s => s.value = 'all');
        els.filterSort.value = 'newest';
        els.tlFilterSort.value = 'newest';
        if (state.skins.loaded) applySkinFilters();
        if (state.tl.loaded) applyTlFilters();
        updateFilterCount();
        showToast('Filters cleared');
    }

    function initFilters() {
        const bind = (el, obj, key, fn) => el.addEventListener('change', () => { obj[key] = el.value; fn(); updateFilterCount(); });
        bind(els.filterOrientation, state.skins.filters, 'orientation', applySkinFilters);
        bind(els.filterCategory, state.skins.filters, 'category', applySkinFilters);
        bind(els.filterResolution, state.skins.filters, 'resolution', applySkinFilters);
        bind(els.filterSort, state.skins.filters, 'sort', applySkinFilters);
        bind(els.tlFilterResolution, state.tl.filters, 'resolution', applyTlFilters);
        bind(els.tlFilterSort, state.tl.filters, 'sort', applyTlFilters);

        els.searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                state.search = els.searchInput.value;
                if (state.skins.loaded) applySkinFilters();
                if (state.tl.loaded) applyTlFilters();
                updateFilterCount();
            }, CONFIG.DEBOUNCE_MS);
        });

        els.resetFilters.addEventListener('click', resetAllFilters);
        els.resetEmpty.addEventListener('click', resetAllFilters);
        els.tlResetEmpty.addEventListener('click', resetAllFilters);
    }

    // ------------------------------------------------------------------
    // Theme & view
    // ------------------------------------------------------------------
    function initTheme() {
        const saved = localStorage.getItem('jlskin-theme');
        const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.toggle('light-mode', saved === 'light' || (!saved && !prefersDark));
        updateThemeUI();

        els.themeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.toggle('light-mode');
            localStorage.setItem('jlskin-theme', isLight ? 'light' : 'dark');
            updateThemeUI();
        });
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('jlskin-theme')) {
                document.body.classList.toggle('light-mode', !e.matches);
                updateThemeUI();
            }
        });
    }
    function updateThemeUI() {
        const isLight = document.body.classList.contains('light-mode');
        els.themeToggleText.textContent = isLight ? 'Dark mode' : 'Light mode';
    }

    function initView() {
        setView(localStorage.getItem('jlskin-view') || 'grid');
        els.viewToggle.addEventListener('click', () => {
            const v = state.view === 'grid' ? 'list' : 'grid';
            setView(v);
            localStorage.setItem('jlskin-view', v);
        });
    }
    function setView(v) {
        state.view = v;
        els.skinsGrid.dataset.view = v;
        document.body.dataset.view = v;
        els.viewToggleText.textContent = v === 'grid' ? 'List view' : 'Grid view';
    }

    // ------------------------------------------------------------------
    // Global events
    // ------------------------------------------------------------------
    function initEvents() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                els.searchInput.focus();
                els.searchInput.select();
            }
            if (e.key === 'Escape') {
                if (!els.modalOverlay.hidden) closeModal(); else closeAllPanels();
            }
            trapFocus(e);
        });

        els.loadMoreBtn.addEventListener('click', loadMore);
        els.modalClose.addEventListener('click', closeModal);
        els.modalOverlay.addEventListener('click', (e) => { if (e.target === els.modalOverlay) closeModal(); });
        els.backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        els.retryLoad.addEventListener('click', loadSkins);
        els.tlRetry.addEventListener('click', loadTranslations);

        const sentinel = document.createElement('div');
        sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;pointer-events:none;';
        document.body.prepend(sentinel);
        new IntersectionObserver(([e]) => { els.backToTop.hidden = e.isIntersecting; }).observe(sentinel);

        const gh = githubInfo();
        if (gh) els.repoLink.href = `https://github.com/${gh.owner}/${gh.repo}`;
    }

    // Open a skin directly from ?skin=<id>
    async function openFromQuery() {
        const id = new URLSearchParams(location.search).get('skin');
        if (!id) return;
        const wait = () => new Promise(r => setTimeout(r, 50));
        for (let i = 0; i < 100 && !state.skins.loaded; i++) await wait();
        if (state.skins.map.has(id)) { setTab('skins'); openModal(id); }
    }

    // ------------------------------------------------------------------
    function init() {
        initTheme();
        initView();
        initPanels();
        initFilters();
        initEvents();
        initTabs();
        loadSkins().then(openFromQuery);
        if (!state.tl.loaded) loadTranslations();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
