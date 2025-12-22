// assets/script.js - Main JavaScript file

const ITEMS_PER_PAGE = 12;
let allSkins = [];
let filteredSkins = [];
let currentPage = 1;
let currentFilters = {
    search: '',
    orientation: '',
    category: 'all'
};

// Load all skin cards from JSON files
async function loadAllSkins() {
    const loadingState = document.getElementById('loadingState');
    const grid = document.getElementById('skinsGrid');
    
    try {
        // Load the index file that lists all card files
        const indexResponse = await fetch('cards/_index.json');
        const indexData = await indexResponse.json();
        
        // Load all individual card JSON files
        const cardPromises = indexData.cards.map(async (filename) => {
            try {
                const response = await fetch(`cards/${filename}`);
                return await response.json();
            } catch (error) {
                console.error(`Failed to load ${filename}:`, error);
                return null;
            }
        });
        
        const cards = await Promise.all(cardPromises);
        allSkins = cards.filter(card => card !== null);
        
        // Hide loading, show content
        loadingState.style.display = 'none';
        grid.style.display = 'grid';
        
        // Update stats
        updateStats();
        
        // Render initial skins
        renderSkins();
        
    } catch (error) {
        console.error('Failed to load skins:', error);
        loadingState.innerHTML = `
            <div class="error-state">
                <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                    ⚠️ Failed to load skins database
                </p>
                <p style="color: var(--text-secondary); font-size: 0.9rem;">
                    Make sure cards/_index.json exists and is accessible
                </p>
            </div>
        `;
    }
}

function updateStats() {
    document.getElementById('totalSkins').textContent = allSkins.length;
    
    // Count new skins (added in last 7 days)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const newSkinsCount = allSkins.filter(skin => {
        const addedDate = new Date(skin.dateAdded);
        return skin.isNew || addedDate > oneWeekAgo;
    }).length;
    
    document.getElementById('newCount').textContent = newSkinsCount;
}

function getFilteredSkins() {
    return allSkins.filter(skin => {
        const matchSearch = skin.title.toLowerCase().includes(currentFilters.search.toLowerCase()) ||
                          skin.author.toLowerCase().includes(currentFilters.search.toLowerCase()) ||
                          (skin.tags && skin.tags.some(tag => tag.toLowerCase().includes(currentFilters.search.toLowerCase())));
        
        const matchOrientation = !currentFilters.orientation || 
                                skin.orientation === currentFilters.orientation ||
                                skin.orientation === 'both';
        
        const matchCategory = currentFilters.category === 'all' || skin.category === currentFilters.category;
        
        return matchSearch && matchOrientation && matchCategory;
    });
}

function renderSkins() {
    filteredSkins = getFilteredSkins();
    const grid = document.getElementById('skinsGrid');
    const loadMoreSection = document.getElementById('loadMoreSection');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const loadInfo = document.getElementById('loadInfo');
    const noResults = document.getElementById('noResults');

    if (filteredSkins.length === 0) {
        grid.style.display = 'none';
        loadMoreSection.style.display = 'none';
        noResults.style.display = 'block';
        document.getElementById('showingCount').textContent = '0';
        return;
    }

    grid.style.display = 'grid';
    noResults.style.display = 'none';

    const itemsToShow = filteredSkins.slice(0, currentPage * ITEMS_PER_PAGE);
    document.getElementById('showingCount').textContent = itemsToShow.length;

    grid.innerHTML = itemsToShow.map(skin => createSkinCard(skin)).join('');

    // Update load more button
    const hasMore = itemsToShow.length < filteredSkins.length;
    if (hasMore) {
        loadMoreSection.style.display = 'flex';
        loadMoreBtn.disabled = false;
        loadMoreBtn.innerHTML = '<span>⬇️ Load More Skins</span>';
        const remaining = filteredSkins.length - itemsToShow.length;
        loadInfo.innerHTML = `Showing <strong>${itemsToShow.length}</strong> of <strong>${filteredSkins.length}</strong> skins. <strong>${remaining}</strong> more available.`;
    } else if (filteredSkins.length > ITEMS_PER_PAGE) {
        loadMoreSection.style.display = 'flex';
        loadMoreBtn.disabled = true;
        loadMoreBtn.innerHTML = '<span>✓ All Skins Loaded</span>';
        loadInfo.innerHTML = `Showing all <strong>${filteredSkins.length}</strong> skins.`;
    } else {
        loadMoreSection.style.display = 'none';
    }
}

function createSkinCard(skin) {
    const downloadAttr = skin.download.startsWith('http') || skin.download === '#' ? 
                         'target="_blank"' : 'download';
    const downloadText = skin.download === '#' || skin.download.startsWith('http') ? 
                         '🔗 External Link' : '⬇️ Download';
    
    return `
        <div class="skin-card" onclick="openModal('${skin.id}')">
            <img class="skin-image" 
                 src="${skin.thumbnail}" 
                 alt="${skin.title}" 
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22280%22 height=%22220%22%3E%3Crect fill=%22%23333%22 width=%22280%22 height=%22220%22/%3E%3Ctext fill=%22%23666%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E'">
            <div class="skin-info">
                <div class="skin-header">
                    <h3 class="skin-title">${skin.title}</h3>
                    ${skin.isNew ? '<span class="new-badge">NEW</span>' : ''}
                </div>
                <p class="skin-author">by ${skin.author}</p>
                <div class="skin-specs">
                    <span class="spec-tag">📐 ${skin.resolution}</span>
                    <span class="spec-tag">🔄 ${skin.orientation}</span>
                </div>
                <a href="${skin.download}" 
                   class="download-btn" 
                   onclick="event.stopPropagation()" 
                   ${downloadAttr}>
                    ${downloadText}
                </a>
            </div>
        </div>
    `;
}

function loadMore() {
    currentPage++;
    renderSkins();
    setTimeout(() => {
        const cards = document.querySelectorAll('.skin-card');
        const targetCard = cards[cards.length - ITEMS_PER_PAGE];
        if (targetCard) {
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 100);
}

function filterSkins() {
    currentFilters.search = document.getElementById('searchInput').value;
    currentPage = 1;
    renderSkins();
}

function toggleFilter(btn, type) {
    const value = btn.dataset.filter;
    const buttons = document.querySelectorAll(`[data-filter]`);
    
    if (btn.classList.contains('active')) {
        btn.classList.remove('active');
        currentFilters[type] = '';
    } else {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilters[type] = value;
    }
    currentPage = 1;
    renderSkins();
}

function filterCategory(category) {
    currentFilters.category = category;
    currentPage = 1;
    document.querySelectorAll('.category-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    renderSkins();
}

function openModal(skinId) {
    const skin = allSkins.find(s => s.id === skinId);
    if (!skin) return;
    
    const modal = document.getElementById('modal');
    const modalImage = document.getElementById('modalImage');
    const modalInfo = document.getElementById('modalInfo');

    const downloadAttr = skin.download.startsWith('http') || skin.download === '#' ? 
                         'target="_blank"' : 'download';
    const downloadText = skin.download === '#' || skin.download.startsWith('http') ? 
                         '🔗 Download from External Source' : '⬇️ Download Skin';

    modalImage.src = skin.thumbnail;
    modalInfo.innerHTML = `
        <h2 style="margin-bottom: 0.5rem;">${skin.title}</h2>
        <p style="color: var(--text-secondary); margin-bottom: 1rem;">by ${skin.author}</p>
        ${skin.description ? `<p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.9rem;">${skin.description}</p>` : ''}
        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
            <span class="spec-tag">📐 ${skin.resolution}</span>
            <span class="spec-tag">🔄 ${skin.orientation}</span>
            <span class="spec-tag">📂 ${skin.category}</span>
        </div>
        ${skin.tags ? `
            <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
                ${skin.tags.map(tag => `<span class="spec-tag" style="background: var(--accent); color: var(--bg-primary);">#${tag}</span>`).join('')}
            </div>
        ` : ''}
        <a href="${skin.download}" class="download-btn" ${downloadAttr}>
            ${downloadText}
        </a>
    `;
    modal.classList.add('active');
}

function closeModal(event) {
    if (!event || event.target.id === 'modal') {
        document.getElementById('modal').classList.remove('active');
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const btn = document.querySelector('.theme-toggle');
    btn.textContent = document.body.classList.contains('light-mode') ? '🌙 Dark Mode' : '☀️ Light Mode';
    
    // Save preference
    localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Back to top button visibility
window.onscroll = function() {
    const btn = document.getElementById('backToTop');
    if (document.body.scrollTop > 300 || document.documentElement.scrollTop > 300) {
        btn.classList.add('visible');
    } else {
        btn.classList.remove('visible');
    }
};

// Load theme preference
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        document.querySelector('.theme-toggle').textContent = '🌙 Dark Mode';
    }
});

// Initialize: Load all skins when page loads
loadAllSkins();