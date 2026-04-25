/**
 * JL-Mod Skins Database v2 - Main Script
 * Refactored for performance, accessibility, and UX
 */

(function() {
    'use strict';

    // ============================
    // Configuration
    // ============================
    const CONFIG = {
        ITEMS_PER_PAGE: 12,
        BATCH_SIZE: 6,
        DEBOUNCE_MS: 300,
        LAZY_THRESHOLD: '50px',
        SCROLL_TOP_THRESHOLD: 400,
        ONE_WEEK_MS: 7 * 24 * 60 * 60 * 1000,
    };

    // ============================
    // DOM Cache
    // ============================
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
        modalSheet: $('#modalSheet'),
        modalImage: $('#modalImage'),
        modalImagePlaceholder: $('#modalImagePlaceholder'),
        modalBody: $('#modalBody'),
        modalClose: $('#modalClose'),
        backToTop: $('#backToTop'),
        themeToggle: $('#themeToggle'),
        viewToggle: $('#viewToggle'),
        sortSelect: $('#sortSelect'),
        toastContainer: $('#toastContainer'),
        resetFilters: $('#resetFilters'),
        retryLoad: $('#retryLoad'),
    };

    // ============================
    // State
    // ============================
    const state = {
        allSkins: [],
        filteredSkins: [],
        skinMap: new Map(),
        currentPage: 1,
        isLoading: false,
        currentView: 'grid',
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
        const entry = entries[0];
        if (entry.isIntersecting) {
            els.backToTop.hidden = true;
        } else {
            els.backToTop.hidden = false;
        }
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

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr;
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function isNewSkin(skin) {
        if (skin.isNew) return true;
        if (!skin.dateAdded) return false;
        const added = new Date(skin.dateAdded).getTime();
        return Date.now() - added < CONFIG.ONE_WEEK_MS;
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
    // Skin Loading
    // ============================
    async function loadAllSkins() {
        if (state.isLoading) return;
        state.isLoading = true;
        els.errorState.hidden = true;

        try {
            // Abort previous if any
            if (abortController) abortController.abort();
            abortController = new AbortController();

            // Try _index.json first (legacy), fallback to index.json (Jekyll-safe)
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
            if (filenames.length === 0) {
                throw new Error('No cards found');
            }

            // Load in batches to avoid blocking
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
                        console.warn(`Failed to load ${filename}`);
                        return null;
                    }
                });
                const batchResults = await Promise.all(batchPromises);
                const valid = batchResults.filter(Boolean);
                loaded.push(...valid);

                // Yield to browser between batches
                if (i + CONFIG.BATCH_SIZE < filenames.length) {
                    await new Promise(r => requestAnimationFrame(r));
                }
            }

            state.allSkins = loaded;
            state.skinMap = new Map(loaded.map(s => [s.id, s]));

            // Remove skeletons
            $$('.skin-card.skeleton').forEach(el => el.remove());

            applyFilters();
            updateStats();

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

        // Sort
        results.sort((a, b) => {
            switch (sort) {
                case 'newest':
                    return new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0);
                case 'oldest':
                    return new Date(a.dateAdded || 0) - new Date(b.dateAdded || 0);
                case 'name-asc':
                    return (a.title || '').localeCompare(b.title || '');
                case 'name-desc':
                    return (b.title || '').localeCompare(a.title || '');
                default:
                    return 0;
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
            els.statsText.innerHTML = `<strong>${total}</strong> skins total · <strong>${newCount}</strong> new this week`;
        } else {
            els.statsText.innerHTML = `Showing <strong>${showing}</strong> of <strong>${total}</strong> skins · <strong>${newCount}</strong> new this week`;
        }
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

        // Use DocumentFragment for batch insert
        const fragment = document.createDocumentFragment();
        const existingIds = new Set(
            Array.from(els.skinsGrid.children)
                .filter(el => !el.classList.contains('skeleton'))
                .map(el => el.dataset.id)
        );

        toShow.forEach(skin => {
            if (existingIds.has(skin.id)) return;
            const card = createSkinCard(skin);
            fragment.appendChild(card);
        });

        if (fragment.childNodes.length > 0) {
            els.skinsGrid.appendChild(fragment);
        }

        // Remove excess cards if filter narrowed
        const visibleIds = new Set(toShow.map(s => s.id));
        Array.from(els.skinsGrid.children).forEach(el => {
            if (!el.classList.contains('skeleton') && !visibleIds.has(el.dataset.id)) {
                el.remove();
            }
        });

        // Load more button
        const hasMore = toShow.length < filteredSkins.length;
        if (hasMore) {
            els.loadMoreWrap.classList.add('visible');
            els.loadMoreBtn.disabled = false;
            const remaining = filteredSkins.length - toShow.length;
            els.loadMoreCount.textContent = `(${remaining} more)`;
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

        // Lazy load image
        const img = article.querySelector('.skin-image[data-src]');
        if (img) lazyImageObserver.observe(img);

        // Click handler
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
        // Scroll to first newly added card
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

        // Focus trap
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

        els.themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-mode');
            const isLight = document.body.classList.contains('light-mode');
            localStorage.setItem('jlskin-theme', isLight ? 'light' : 'dark');
            showToast(isLight ? 'Switched to light mode' : 'Switched to dark mode');
        });

        // Listen to system preference changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('jlskin-theme')) {
                document.body.classList.toggle('light-mode', !e.matches);
            }
        });
    }

    // ============================
    // View Toggle
    // ============================
    function initViewToggle() {
        const savedView = localStorage.getItem('jlskin-view') || 'grid';
        setView(savedView);

        els.viewToggle.addEventListener('click', () => {
            const newView = state.currentView === 'grid' ? 'list' : 'grid';
            setView(newView);
            localStorage.setItem('jlskin-view', newView);
            showToast(newView === 'list' ? 'List view enabled' : 'Grid view enabled');
        });
    }

    function setView(view) {
        state.currentView = view;
        els.skinsGrid.setAttribute('data-view', view);
        els.viewToggle.setAttribute('data-view', view);
    }

    // ============================
    // Event Delegation & Handlers
    // ============================
    function initEventListeners() {
        // Search with debounce
        els.searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                state.filters.search = els.searchInput.value;
                applyFilters();
            }, CONFIG.DEBOUNCE_MS);
        });

        // Keyboard shortcut: Ctrl+K / Cmd+K
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                els.searchInput.focus();
                els.searchInput.select();
            }
            if (e.key === 'Escape' && !els.modalOverlay.hidden) {
                closeModal();
            }
        });

        // Orientation filters
        document.querySelectorAll('.filter-chip[data-type="orientation"]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip[data-type="orientation"]').forEach(b => {
                    b.setAttribute('aria-pressed', 'false');
                    b.classList.remove('active');
                });
                btn.setAttribute('aria-pressed', 'true');
                btn.classList.add('active');
                state.filters.orientation = btn.dataset.filter;
                applyFilters();
            });
        });

        // Category filters
        document.querySelectorAll('.category-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.filters.category = btn.dataset.category;
                applyFilters();
            });
        });

        // Sort
        els.sortSelect.addEventListener('change', () => {
            state.filters.sort = els.sortSelect.value;
            applyFilters();
        });

        // Load more
        els.loadMoreBtn.addEventListener('click', loadMore);

        // Modal close
        els.modalClose.addEventListener('click', closeModal);
        els.modalOverlay.addEventListener('click', (e) => {
            if (e.target === els.modalOverlay) closeModal();
        });

        // Back to top
        els.backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        // Reset filters
        els.resetFilters.addEventListener('click', resetAllFilters);
        els.retryLoad.addEventListener('click', () => {
            els.errorState.hidden = true;
            loadAllSkins();
        });

        // Scroll top observer
        const topSentinel = document.createElement('div');
        topSentinel.style.position = 'absolute';
        topSentinel.style.top = '0';
        topSentinel.style.height = '1px';
        document.body.prepend(topSentinel);
        scrollTopObserver.observe(topSentinel);
    }

    function resetAllFilters() {
        state.filters = { search: '', orientation: 'all', category: 'all', sort: 'newest' };
        els.searchInput.value = '';
        els.sortSelect.value = 'newest';

        document.querySelectorAll('.filter-chip[data-type="orientation"]').forEach(b => {
            b.setAttribute('aria-pressed', b.dataset.filter === 'all' ? 'true' : 'false');
            b.classList.toggle('active', b.dataset.filter === 'all');
        });

        document.querySelectorAll('.category-pill').forEach(b => {
            b.classList.toggle('active', b.dataset.category === 'all');
        });

        applyFilters();
        showToast('Filters reset');
    }

    // ============================
    // Initialize
    // ============================
    function init() {
        initTheme();
        initViewToggle();
        initEventListeners();
        loadAllSkins();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
