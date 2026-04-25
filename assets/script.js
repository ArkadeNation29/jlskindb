/**
 * JL-Mod Skins Database v2.2 - Minimalist Header
 * Single bar layout: Brand | Search | Filter + Menu
 */

(function() {
    'use strict';

    const CONFIG = {
        ITEMS_PER_PAGE: 12,
        BATCH_SIZE: 6,
        DEBOUNCE_MS: 300,
        LAZY_THRESHOLD: '50px',
        ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1000,
    };

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        searchInput: $('#searchInput'),
        skinsGrid: $('#skinsGrid'),
        loadMoreWrap: $('#loadMoreWrap'),
        loadMoreBtn: $('#loadMoreBtn'),
        loadMoreCount: $('#loadMoreCount'),
        emptyState: $('#emptyState'),
        errorState: $('#errorState'),
        statsText: $('#statsText'),
        modalOverlay: $('#modalOverlay'),
        modalImage: $('#modalImage'),
        modalBody: $('#modalBody'),
        modalClose: $('#modalClose'),
        backToTop: $('#backToTop'),
        toastContainer: $('#toastContainer'),
        filterToggle: $('#filterToggle'),
        filterPanel: $('#filterPanel'),
        moreMenuToggle: $('#moreMenuToggle'),
        moreMenu: $('#moreMenu'),
        viewToggle: $('#viewToggle'),
        viewToggleText: $('#viewToggleText'),
        themeToggle: $('#themeToggle'),
        themeToggleText: $('#themeToggleText'),
        filterOrientation: $('#filterOrientation'),
        filterCategory: $('#filterCategory'),
        filterSort: $('#filterSort'),
        filterCount: $('#filterCount'),
        resetFilters: $('#resetFilters'),
        resetEmpty: $('#resetEmpty'),
        retryLoad: $('#retryLoad'),
    };

    const state = {
        allSkins: [],
        filteredSkins: [],
        skinMap: new Map(),
        currentPage: 1,
        isLoading: false,
        currentView: 'list',
        filters: {
            search: '',
            orientation: 'all',
            category: 'all',
            sort: 'newest',
        },
    };

    let searchDebounceTimer = null;
    let abortController = null;

    // ============================
    // Intersection Observers
    // ============================
    const lazyImageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const src = img.dataset.src;
                if (src) {
                    img.src = src;
                    img.removeAttribute('data-src');
                    img.onload = () => img.classList.add('loaded');
                    img.onerror = () => {
                        img.src = placeholderSVG();
                        img.classList.add('loaded');
                    };
                }
                lazyImageObserver.unobserve(img);
            }
        });
    }, { rootMargin: CONFIG.LAZY_THRESHOLD });

    const scrollTopObserver = new IntersectionObserver((entries) => {
        els.backToTop.hidden = entries[0].isIntersecting;
    }, { threshold: 0 });

    // ============================
    // Helpers
    // ============================
    function placeholderSVG() {
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='250'%3E%3Crect fill='%23252535' width='400' height='250'/%3E%3Ctext fill='%235a5a6a' x='50%25' y='50%25' text-anchor='middle' dy='.3em' font-family='sans-serif' font-size='14'%3ENo Image%3C/text%3E%3C/svg%3E`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function isNewSkin(skin) {
        if (skin.isNew) return true;
        if (!skin.dateAdded) return false;
        return Date.now() - new Date(skin.dateAdded).getTime() < CONFIG.ONE_WEEK_MS;
    }

    function showToast(message, duration = 3000) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        els.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    }

    // ============================
    // Panel / Menu Toggle Logic
    // ============================
    function togglePanel(panel, trigger, otherPanel, otherTrigger) {
        const isHidden = panel.hidden;

        // Close other if open
        if (!otherPanel.hidden) {
            otherPanel.hidden = true;
            otherTrigger?.classList.remove('active');
            otherTrigger?.setAttribute('aria-expanded', 'false');
        }

        if (isHidden) {
            panel.hidden = false;
            trigger.classList.add('active');
            trigger.setAttribute('aria-expanded', 'true');
        } else {
            panel.hidden = true;
            trigger.classList.remove('active');
            trigger.setAttribute('aria-expanded', 'false');
        }
    }

    function closeAllPanels() {
        els.filterPanel.hidden = true;
        els.filterToggle.classList.remove('active');
        els.filterToggle.setAttribute('aria-expanded', 'false');

        els.moreMenu.hidden = true;
        els.moreMenuToggle.classList.remove('active');
        els.moreMenuToggle.setAttribute('aria-expanded', 'false');
    }

    function initPanels() {
        els.filterToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanel(els.filterPanel, els.filterToggle, els.moreMenu, els.moreMenuToggle);
        });

        els.moreMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePanel(els.moreMenu, els.moreMenuToggle, els.filterPanel, els.filterToggle);
        });

        document.addEventListener('click', (e) => {
            if (!els.filterPanel.contains(e.target) && !els.filterToggle.contains(e.target)) {
                els.filterPanel.hidden = true;
                els.filterToggle.classList.remove('active');
                els.filterToggle.setAttribute('aria-expanded', 'false');
            }
            if (!els.moreMenu.contains(e.target) && !els.moreMenuToggle.contains(e.target)) {
                els.moreMenu.hidden = true;
                els.moreMenuToggle.classList.remove('active');
                els.moreMenuToggle.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // ============================
    // Skin Loading
    // ============================
    async function loadAllSkins() {
        if (state.isLoading) return;
        state.isLoading = true;
        els.errorState.hidden = true;

        try {
            if (abortController) abortController.abort();
            abortController = new AbortController();

            let indexRes;
            try {
                indexRes = await fetch('cards/_index.json', { signal: abortController.signal });
                if (!indexRes.ok) throw new Error();
            } catch {
                indexRes = await fetch('cards/index.json', { signal: abortController.signal });
                if (!indexRes.ok) throw new Error('Index not found');
            }
            const indexData = await indexRes.json();
            const filenames = indexData.cards || [];
            if (filenames.length === 0) throw new Error('No cards found');

            const loaded = [];
            for (let i = 0; i < filenames.length; i += CONFIG.BATCH_SIZE) {
                const batch = filenames.slice(i, i + CONFIG.BATCH_SIZE);
                const batchPromises = batch.map(async (filename) => {
                    try {
                        const res = await fetch(`cards/${filename}`, { signal: abortController.signal });
                        if (!res.ok) return null;
                        const card = await res.json();
                        card._filename = filename;
                        return card;
                    } catch {
                        return null;
                    }
                });
                const batchResults = await Promise.all(batchPromises);
                loaded.push(...batchResults.filter(Boolean));
                if (i + CONFIG.BATCH_SIZE < filenames.length) {
                    await new Promise(r => requestAnimationFrame(r));
                }
            }

            state.allSkins = loaded;
            state.skinMap = new Map(loaded.map(s => [s.id, s]));

            $$('.skin-card.skeleton').forEach(el => el.remove());
            applyFilters();
            updateStats();
            updateFilterCount();

        } catch (err) {
            console.error('Load error:', err);
            els.errorState.hidden = false;
            els.skinsGrid.innerHTML = '';
        } finally {
            state.isLoading = false;
        }
    }

    // ============================
    // Filtering & Sorting
    // ============================
    function applyFilters() {
        const { search, orientation, category, sort } = state.filters;
        const q = search.toLowerCase().trim();

        let results = state.allSkins.filter(skin => {
            const matchSearch = !q ||
                skin.title?.toLowerCase().includes(q) ||
                skin.author?.toLowerCase().includes(q) ||
                skin.tags?.some(t => t.toLowerCase().includes(q));

            const matchOrientation = orientation === 'all' ||
                skin.orientation === orientation ||
                skin.orientation === 'both';

            const matchCategory = category === 'all' || skin.category === category;

            return matchSearch && matchOrientation && matchCategory;
        });

        results.sort((a, b) => {
            switch (sort) {
                case 'newest': return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
                case 'oldest': return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
                case 'name-asc': return (a.title || '').localeCompare(b.title || '');
                case 'name-desc': return (b.title || '').localeCompare(a.title || '');
                default: return 0;
            }
        });

        state.filteredSkins = results;
        state.currentPage = 1;
        renderSkins();
    }

    function updateStats() {
        const total = state.allSkins.length;
        const showing = state.filteredSkins.length;
        const newCount = state.allSkins.filter(isNewSkin).length;

        if (total === 0) {
            els.statsText.textContent = 'Loading skins...';
        } else if (showing === total) {
            els.statsText.innerHTML = `<strong>${total}</strong> skins · <strong>${newCount}</strong> new`;
        } else {
            els.statsText.innerHTML = `<strong>${showing}</strong> / <strong>${total}</strong> skins · <strong>${newCount}</strong> new`;
        }
    }

    function updateFilterCount() {
        const active = [];
        if (state.filters.orientation !== 'all') active.push(state.filters.orientation);
        if (state.filters.category !== 'all') active.push(state.filters.category);
        if (state.filters.sort !== 'newest') active.push(state.filters.sort);
        if (state.filters.search) active.push('search');

        els.filterCount.textContent = active.length > 0
            ? `${active.length} filter${active.length > 1 ? 's' : ''} active`
            : 'No filters';
    }

    // ============================
    // Rendering
    // ============================
    function renderSkins() {
        const { filteredSkins, currentPage } = state;
        const limit = currentPage * CONFIG.ITEMS_PER_PAGE;
        const toShow = filteredSkins.slice(0, limit);

        if (filteredSkins.length === 0) {
            els.skinsGrid.innerHTML = '';
            els.emptyState.hidden = false;
            els.loadMoreWrap.classList.remove('visible');
            updateStats();
            return;
        }

        els.emptyState.hidden = true;

        const fragment = document.createDocumentFragment();
        const existingIds = new Set(
            Array.from(els.skinsGrid.children)
                .filter(el => !el.classList.contains('skeleton'))
                .map(el => el.dataset.id)
        );

        toShow.forEach(skin => {
            if (existingIds.has(skin.id)) return;
            fragment.appendChild(createSkinCard(skin));
        });

        if (fragment.childNodes.length > 0) {
            els.skinsGrid.appendChild(fragment);
        }

        const visibleIds = new Set(toShow.map(s => s.id));
        Array.from(els.skinsGrid.children).forEach(el => {
            if (!el.classList.contains('skeleton') && !visibleIds.has(el.dataset.id)) {
                el.remove();
            }
        });

        const hasMore = toShow.length < filteredSkins.length;
        if (hasMore) {
            els.loadMoreWrap.classList.add('visible');
            els.loadMoreBtn.disabled = false;
            els.loadMoreCount.textContent = `(${filteredSkins.length - toShow.length} more)`;
            els.loadMoreBtn.querySelector('.btn-text').textContent = 'Load More';
        } else if (filteredSkins.length > CONFIG.ITEMS_PER_PAGE) {
            els.loadMoreWrap.classList.add('visible');
            els.loadMoreBtn.disabled = true;
            els.loadMoreCount.textContent = '(all loaded)';
            els.loadMoreBtn.querySelector('.btn-text').textContent = 'All Loaded';
        } else {
            els.loadMoreWrap.classList.remove('visible');
        }

        updateStats();
    }

    function createSkinCard(skin) {
        const article = document.createElement('article');
        article.className = 'skin-card';
        article.dataset.id = skin.id;
        article.setAttribute('role', 'listitem');
        article.setAttribute('tabindex', '0');
        article.setAttribute('aria-label', `${escapeHtml(skin.title)} by ${escapeHtml(skin.author)}`);

        const isExternal = skin.download === '#' || /^https?:\/\//.test(skin.download);
        const newBadge = isNewSkin(skin) ? '<span class="new-badge">New</span>' : '';
        const tagsHtml = skin.tags?.length
            ? `<div class="skin-specs">${skin.tags.slice(0, 3).map(t => `<span class="spec-tag">#${escapeHtml(t)}</span>`).join('')}</div>`
            : '';

        article.innerHTML = `
            <div class="skin-image-wrap">
                <img class="skin-image" data-src="${escapeHtml(skin.thumbnail || '')}" alt="${escapeHtml(skin.title)}" loading="lazy">
                <div class="skin-image-placeholder">Loading...</div>
            </div>
            <div class="skin-info">
                <div class="skin-header">
                    <h3 class="skin-title">${escapeHtml(skin.title)}</h3>
                    ${newBadge}
                </div>
                <p class="skin-author">by ${escapeHtml(skin.author)}</p>
                <div class="skin-specs">
                    <span class="spec-tag">📐 ${escapeHtml(skin.resolution || 'N/A')}</span>
                    <span class="spec-tag">🔄 ${escapeHtml(skin.orientation || 'N/A')}</span>
                </div>
                ${tagsHtml}
                <div class="skin-actions">
                    <a href="${escapeHtml(skin.download || '#')}" class="download-btn ${isExternal ? 'external' : ''}"
                       ${isExternal ? 'target="_blank" rel="noopener"' : 'download'}
                       onclick="event.stopPropagation()">
                        ${isExternal ? '🔗 External' : '⬇️ Download'}
                    </a>
                </div>
            </div>
        `;

        const img = article.querySelector('.skin-image[data-src]');
        if (img) lazyImageObserver.observe(img);

        article.addEventListener('click', () => openModal(skin.id));
        article.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openModal(skin.id);
            }
        });

        return article;
    }

    function loadMore() {
        state.currentPage++;
        renderSkins();
        const cards = els.skinsGrid.querySelectorAll('.skin-card:not(.skeleton)');
        const firstNew = cards[(state.currentPage - 1) * CONFIG.ITEMS_PER_PAGE];
        if (firstNew) {
            firstNew.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // ============================
    // Modal
    // ============================
    function openModal(skinId) {
        const skin = state.skinMap.get(skinId);
        if (!skin) return;

        const isExternal = skin.download === '#' || /^https?:\/\//.test(skin.download);
        const newBadge = isNewSkin(skin) ? '<span class="new-badge">New</span>' : '';

        els.modalImage.src = '';
        els.modalImage.classList.remove('loaded');
        els.modalImage.src = skin.thumbnail || placeholderSVG();
        els.modalImage.alt = skin.title || '';
        els.modalImage.onload = () => els.modalImage.classList.add('loaded');

        els.modalBody.innerHTML = `
            <h2>${escapeHtml(skin.title)} ${newBadge}</h2>
            <p class="modal-author">by ${escapeHtml(skin.author)} · ${escapeHtml(skin.category || 'Uncategorized')}</p>
            ${skin.description ? `<p class="modal-desc">${escapeHtml(skin.description)}</p>` : ''}
            <div class="modal-tags">
                <span class="spec-tag">📐 ${escapeHtml(skin.resolution || 'N/A')}</span>
                <span class="spec-tag">🔄 ${escapeHtml(skin.orientation || 'N/A')}</span>
                ${skin.tags?.map(t => `<span class="modal-tag">#${escapeHtml(t)}</span>`).join('') || ''}
            </div>
            <a href="${escapeHtml(skin.download || '#')}" class="modal-download"
               ${isExternal ? 'target="_blank" rel="noopener"' : 'download'}>
                ${isExternal ? '🔗 Download from External Source' : '⬇️ Download Skin'}
            </a>
        `;

        els.modalOverlay.hidden = false;
        document.body.style.overflow = 'hidden';
        els.modalClose.focus();
    }

    function closeModal() {
        els.modalOverlay.hidden = true;
        document.body.style.overflow = '';
    }

    // ============================
    // Theme
    // ============================
    function initTheme() {
        const saved = localStorage.getItem('jlskin-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

        if (saved === 'light' || (!saved && !prefersDark)) {
            document.body.classList.add('light-mode');
        }
        updateThemeUI();

        els.themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            localStorage.setItem('jlskin-theme', isLight ? 'light' : 'dark');
            updateThemeUI();
            showToast(isLight ? 'Light mode' : 'Dark mode');
        });

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('jlskin-theme')) {
                document.body.classList.toggle('light-mode', !e.matches);
                updateThemeUI();
            }
        });
    }

    function updateThemeUI() {
        const isLight = document.body.classList.contains('light-mode');
        els.themeToggleText.textContent = isLight ? 'Light Mode' : 'Dark Mode';
    }

    // ============================
    // View Toggle
    // ============================
    function initViewToggle() {
        const savedView = localStorage.getItem('jlskin-view') || 'list';
        setView(savedView);

        els.viewToggle.addEventListener('click', () => {
            const newView = state.currentView === 'grid' ? 'list' : 'grid';
            setView(newView);
            localStorage.setItem('jlskin-view', newView);
            updateViewUI();
            showToast(newView === 'list' ? 'List view' : 'Grid view');
        });
    }

    function setView(view) {
        state.currentView = view;
        els.skinsGrid.setAttribute('data-view', view);
        document.body.setAttribute('data-view', view);
    }

    function updateViewUI() {
        els.viewToggleText.textContent = state.currentView === 'list' ? 'List View' : 'Grid View';
    }

    // ============================
    // Filter Selects
    // ============================
    function initFilterSelects() {
        els.filterOrientation.addEventListener('change', () => {
            state.filters.orientation = els.filterOrientation.value;
            applyFilters();
            updateFilterCount();
        });

        els.filterCategory.addEventListener('change', () => {
            state.filters.category = els.filterCategory.value;
            applyFilters();
            updateFilterCount();
        });

        els.filterSort.addEventListener('change', () => {
            state.filters.sort = els.filterSort.value;
            applyFilters();
            updateFilterCount();
        });
    }

    // ============================
    // Event Listeners
    // ============================
    function initEventListeners() {
        // Search
        els.searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                state.filters.search = els.searchInput.value;
                applyFilters();
                updateFilterCount();
            }, CONFIG.DEBOUNCE_MS);
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                els.searchInput.focus();
                els.searchInput.select();
            }
            if (e.key === 'Escape') {
                if (!els.modalOverlay.hidden) {
                    closeModal();
                } else {
                    closeAllPanels();
                }
            }
        });

        // Load more
        els.loadMoreBtn.addEventListener('click', loadMore);

        // Modal
        els.modalClose.addEventListener('click', closeModal);
        els.modalOverlay.addEventListener('click', (e) => {
            if (e.target === els.modalOverlay) closeModal();
        });

        // Back to top
        els.backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Reset
        els.resetFilters.addEventListener('click', resetAllFilters);
        els.resetEmpty.addEventListener('click', resetAllFilters);
        els.retryLoad.addEventListener('click', () => {
            els.errorState.hidden = true;
            loadAllSkins();
        });

        // Scroll observer
        const topSentinel = document.createElement('div');
        topSentinel.style.cssText = 'position:absolute;top:0;height:1px;';
        document.body.prepend(topSentinel);
        scrollTopObserver.observe(topSentinel);
    }

    function resetAllFilters() {
        state.filters = { search: '', orientation: 'all', category: 'all', sort: 'newest' };
        els.searchInput.value = '';
        els.filterOrientation.value = 'all';
        els.filterCategory.value = 'all';
        els.filterSort.value = 'newest';
        applyFilters();
        updateFilterCount();
        showToast('Filters reset');
    }

    // ============================
    // Initialize
    // ============================
    function init() {
        initTheme();
        initViewToggle();
        initPanels();
        initFilterSelects();
        initEventListeners();
        loadAllSkins();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
