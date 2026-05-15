const CATALOG_ORDER = ['Agent Sec', 'Agent for Sec', 'Infra', 'Frontier Sec', 'Model'];
const CATALOG_FALLBACK = 'Frontier Sec';

let currentDate = '';
let availableDates = [];
let currentCategory = 'all';
let urlCategoryParam = null;
let urlAuthorParam = null;
let urlKeywordsParam = null;
let paperData = {};
let flatpickrInstance = null;
let isRangeMode = false;
let activeKeywords = [];
let userKeywords = [];
let activeAuthors = [];
let userAuthors = [];
let currentPaperIndex = 0;
let currentFilteredPapers = [];
let textSearchQuery = '';
let previousActiveKeywords = null;
let previousActiveAuthors = null;

function loadUserKeywords() {
    const saved = localStorage.getItem('preferredKeywords');
    try { userKeywords = saved ? JSON.parse(saved) : []; } catch { userKeywords = []; }
    activeKeywords = [...userKeywords];
    renderFilterTags();
}

function loadUserAuthors() {
    const saved = localStorage.getItem('preferredAuthors');
    try { userAuthors = saved ? JSON.parse(saved) : []; } catch { userAuthors = []; }
    activeAuthors = [...userAuthors];
    renderFilterTags();
}

function renderFilterTags() {
    const filterTagsEl = document.getElementById('filterTags');
    const filterContainer = document.querySelector('.filter-label-container');
    if (!filterTagsEl) return;

    filterContainer.style.display = 'flex';
    const hasFilters = (userAuthors && userAuthors.length > 0) || (userKeywords && userKeywords.length > 0);
    if (!hasFilters) {
        filterTagsEl.style.display = 'none';
        filterTagsEl.innerHTML = '';
        return;
    }
    filterTagsEl.style.display = 'flex';
    filterTagsEl.innerHTML = '';

    userAuthors.forEach(author => {
        const tag = document.createElement('span');
        tag.className = `category-button author-button ${activeAuthors.includes(author) ? 'active' : ''}`;
        tag.textContent = author;
        tag.dataset.author = author;
        tag.addEventListener('click', () => toggleAuthorFilter(author));
        filterTagsEl.appendChild(tag);
    });

    userKeywords.forEach(keyword => {
        const tag = document.createElement('span');
        tag.className = `category-button keyword-button ${activeKeywords.includes(keyword) ? 'active' : ''}`;
        tag.textContent = keyword;
        tag.dataset.keyword = keyword;
        tag.addEventListener('click', () => toggleKeywordFilter(keyword));
        filterTagsEl.appendChild(tag);
    });
}

function toggleKeywordFilter(keyword) {
    const idx = activeKeywords.indexOf(keyword);
    if (idx === -1) activeKeywords.push(keyword); else activeKeywords.splice(idx, 1);
    document.querySelectorAll('[data-keyword]').forEach(tag => {
        if (tag.dataset.keyword === keyword) tag.classList.toggle('active', activeKeywords.includes(keyword));
    });
    renderPapers();
}

function toggleAuthorFilter(author) {
    const idx = activeAuthors.indexOf(author);
    if (idx === -1) activeAuthors.push(author); else activeAuthors.splice(idx, 1);
    document.querySelectorAll('[data-author]').forEach(tag => {
        if (tag.dataset.author === author) tag.classList.toggle('active', activeAuthors.includes(author));
    });
    renderPapers();
}

function getUrlParam(name) {
    const val = new URLSearchParams(window.location.search).get(name);
    return val ? decodeURIComponent(val) : null;
}

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadUserKeywords();
    loadUserAuthors();
    urlCategoryParam = getUrlParam('category');
    urlAuthorParam = getUrlParam('author') ? getUrlParam('author').split(',').map(s => s.trim()) : null;
    urlKeywordsParam = getUrlParam('keywords') ? getUrlParam('keywords').split(',').map(s => s.trim()) : null;
    fetchAvailableDates().then(() => {
        if (availableDates.length > 0) loadPapersByDate(availableDates[0]);
    });
});

function initEventListeners() {
    document.getElementById('calendarButton').addEventListener('click', e => {
        e.stopPropagation();
        toggleDatePicker();
    });

    const datePickerModal = document.querySelector('.date-picker-modal');
    datePickerModal.addEventListener('click', e => {
        if (e.target === datePickerModal) toggleDatePicker();
    });
    document.querySelector('.date-picker-content').addEventListener('click', e => e.stopPropagation());
    document.getElementById('dateRangeMode').addEventListener('change', toggleRangeMode);
    document.getElementById('closeModal').addEventListener('click', closeModal);

    document.querySelector('.paper-modal').addEventListener('click', e => {
        if (e.target === document.querySelector('.paper-modal')) closeModal();
    });

    document.addEventListener('keydown', e => {
        const active = document.activeElement;
        const inputFocused = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
        const paperModal = document.getElementById('paperModal');
        const dateModal = document.getElementById('datePickerModal');

        if (e.key === 'Escape') {
            if (paperModal.classList.contains('active')) closeModal();
            else if (dateModal.classList.contains('active')) toggleDatePicker();
        } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && paperModal.classList.contains('active')) {
            e.preventDefault();
            if (e.key === 'ArrowLeft') navigateToPreviousPaper(); else navigateToNextPaper();
        } else if ((e.key === ' ' || e.key === 'Spacebar') && !inputFocused && !dateModal.classList.contains('active')) {
            e.preventDefault();
            showRandomPaper();
        }
    });

    const categoryScroll = document.querySelector('.category-scroll');
    if (categoryScroll) {
        categoryScroll.addEventListener('wheel', e => { if (e.deltaY) { e.preventDefault(); categoryScroll.scrollLeft += e.deltaY; } });
    }

    const backToTop = document.getElementById('backToTop');
    if (backToTop) {
        const update = () => backToTop.classList.toggle('visible', (window.pageYOffset || document.documentElement.scrollTop) > 300);
        update();
        window.addEventListener('scroll', update, { passive: true });
        backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    const searchToggle = document.getElementById('textSearchToggle');
    const searchWrapper = document.querySelector('#textSearchContainer .search-input-wrapper');
    const searchInput = document.getElementById('textSearchInput');
    const searchClear = document.getElementById('textSearchClear');

    if (searchToggle && searchWrapper && searchInput && searchClear) {
        searchToggle.addEventListener('click', e => {
            e.stopPropagation();
            searchWrapper.style.display = 'flex';
            searchInput.focus();
        });

        searchInput.addEventListener('input', () => {
            const value = searchInput.value.trim();
            textSearchQuery = value;
            if (textSearchQuery.length > 0) {
                if (previousActiveKeywords === null) previousActiveKeywords = [...activeKeywords];
                if (previousActiveAuthors === null) previousActiveAuthors = [...activeAuthors];
                [...activeKeywords].forEach(k => toggleKeywordFilter(k));
                [...activeAuthors].forEach(a => toggleAuthorFilter(a));
            } else {
                if (previousActiveKeywords) previousActiveKeywords.forEach(k => { if (!activeKeywords.includes(k)) toggleKeywordFilter(k); });
                if (previousActiveAuthors) previousActiveAuthors.forEach(a => { if (!activeAuthors.includes(a)) toggleAuthorFilter(a); });
                previousActiveKeywords = null;
                previousActiveAuthors = null;
                searchWrapper.style.display = 'none';
            }
            searchClear.style.display = textSearchQuery.length > 0 ? 'inline-flex' : 'none';
            renderPapers();
        });

        searchClear.addEventListener('click', e => {
            e.stopPropagation();
            searchInput.value = '';
            textSearchQuery = '';
            searchClear.style.display = 'none';
            if (previousActiveKeywords) previousActiveKeywords.forEach(k => { if (!activeKeywords.includes(k)) toggleKeywordFilter(k); });
            if (previousActiveAuthors) previousActiveAuthors.forEach(a => { if (!activeAuthors.includes(a)) toggleAuthorFilter(a); });
            previousActiveKeywords = null;
            previousActiveAuthors = null;
            renderPapers();
            searchWrapper.style.display = 'none';
        });

        searchInput.addEventListener('blur', () => {
            if (!searchInput.value.trim()) searchWrapper.style.display = 'none';
        });
    }
}

async function fetchAvailableDates() {
    try {
        const response = await fetch(DATA_CONFIG.getDataUrl('assets/file-list.txt'));
        if (!response.ok) return [];
        const text = await response.text();
        const dateLanguageMap = new Map();
        const dates = [];
        text.trim().split('\n').forEach(file => {
            const match = file.match(/(\d{4}-\d{2}-\d{2})_AI_enhanced_(English|Chinese)\.jsonl/);
            if (match) {
                const [, date, lang] = match;
                if (!dateLanguageMap.has(date)) { dateLanguageMap.set(date, []); dates.push(date); }
                dateLanguageMap.get(date).push(lang);
            }
        });
        window.dateLanguageMap = dateLanguageMap;
        availableDates = [...new Set(dates)].sort((a, b) => new Date(b) - new Date(a));
        initDatePicker();
        return availableDates;
    } catch (e) {
        console.error('Failed to fetch available dates:', e);
        return [];
    }
}

function selectLanguageForDate(date) {
    const langs = window.dateLanguageMap?.get(date) || [];
    if (!langs.length) return 'Chinese';
    return langs.includes('Chinese') ? 'Chinese' : langs[0];
}

function initDatePicker() {
    const input = document.getElementById('datepicker');
    if (flatpickrInstance) flatpickrInstance.destroy();
    flatpickrInstance = flatpickr(input, {
        inline: true,
        dateFormat: 'Y-m-d',
        defaultDate: availableDates[0],
        enable: [d => {
            const s = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            return s <= availableDates[0];
        }],
        onChange(selectedDates, dateStr) {
            if (isRangeMode && selectedDates.length === 2) {
                loadPapersByDateRange(formatDateForAPI(selectedDates[0]), formatDateForAPI(selectedDates[1]));
                toggleDatePicker();
            } else if (!isRangeMode && selectedDates.length === 1) {
                loadPapersByDate(formatDateForAPI(selectedDates[0]));
                toggleDatePicker();
            }
        }
    });
    const el = document.querySelector('.flatpickr-input');
    if (el) el.style.display = 'none';
}

function formatDateForAPI(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function toggleRangeMode() {
    isRangeMode = document.getElementById('dateRangeMode').checked;
    if (flatpickrInstance) flatpickrInstance.set('mode', isRangeMode ? 'range' : 'single');
}

async function loadPapersByDate(date) {
    currentDate = date;
    document.getElementById('currentDate').textContent = formatDate(date);
    if (flatpickrInstance) flatpickrInstance.setDate(date, false);

    const container = document.getElementById('paperContainer');
    container.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Loading papers...</p></div>`;

    try {
        const lang = selectLanguageForDate(date);
        const response = await fetch(DATA_CONFIG.getDataUrl(`data/${date}_AI_enhanced_${lang}.jsonl`));
        if (!response.ok) {
            if (response.status === 404) {
                container.innerHTML = `<div class="loading-container"><p>No papers found for this date.</p></div>`;
                paperData = {};
                renderCategoryFilter({ sortedCategories: [], categoryCounts: {} });
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }
        const text = await response.text();
        if (!text || !text.trim()) {
            container.innerHTML = `<div class="loading-container"><p>No papers found for this date.</p></div>`;
            paperData = {};
            renderCategoryFilter({ sortedCategories: [], categoryCounts: {} });
            return;
        }
        paperData = parseJsonlData(text, date);
        renderCategoryFilter(getAllCategories(paperData));
        renderPapers();
    } catch (e) {
        console.error('Failed to load papers:', e);
        container.innerHTML = `<div class="loading-container"><p>Failed to load data. Error: ${e.message}</p></div>`;
    }
}

async function loadPapersByDateRange(startDate, endDate) {
    const valid = availableDates.filter(d => d >= startDate && d <= endDate);
    if (!valid.length) { alert('No available papers in the selected date range.'); return; }

    currentDate = `${startDate} to ${endDate}`;
    document.getElementById('currentDate').textContent = `${formatDate(startDate)} – ${formatDate(endDate)}`;

    const container = document.getElementById('paperContainer');
    container.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Loading papers...</p></div>`;

    try {
        const all = {};
        for (const date of valid) {
            const lang = selectLanguageForDate(date);
            const resp = await fetch(DATA_CONFIG.getDataUrl(`data/${date}_AI_enhanced_${lang}.jsonl`));
            const text = await resp.text();
            const dataPapers = parseJsonlData(text, date);
            Object.keys(dataPapers).forEach(cat => {
                if (!all[cat]) all[cat] = [];
                all[cat] = all[cat].concat(dataPapers[cat]);
            });
        }
        paperData = all;
        renderCategoryFilter(getAllCategories(paperData));
        renderPapers();
    } catch (e) {
        console.error('Failed to load papers:', e);
        container.innerHTML = `<div class="loading-container"><p>Failed to load data. Error: ${e.message}</p></div>`;
    }
}

function parseJsonlData(jsonlText, date) {
    const result = {};
    jsonlText.trim().split('\n').forEach(line => {
        try {
            const paper = JSON.parse(line);
            const catalog = (paper.catalog && CATALOG_ORDER.includes(paper.catalog)) ? paper.catalog : CATALOG_FALLBACK;
            if (!result[catalog]) result[catalog] = [];
            result[catalog].push({
                id: paper.id,
                title: paper.title || '',
                url: paper.abs || paper.pdf || `https://arxiv.org/abs/${paper.id}`,
                authors: Array.isArray(paper.authors) ? paper.authors.join(', ') : (paper.authors || ''),
                category: Array.isArray(paper.categories) ? paper.categories : (paper.categories ? [paper.categories] : []),
                catalog,
                source_type: paper.source_type || 'arxiv',
                venue_name: paper.venue_name || '',
                venue_year: paper.venue_year || '',
                venue_track: paper.venue_track || '',
                summary: paper.AI?.tldr || paper.summary || '',
                details: paper.summary || '',
                date,
                motivation: paper.AI?.motivation || '',
                method: paper.AI?.method || '',
                result: paper.AI?.result || '',
                conclusion: paper.AI?.conclusion || '',
                code_url: paper.code_url || '',
                code_stars: paper.code_stars || 0,
                code_last_update: paper.code_last_update || '',
            });
        } catch (e) {
            console.error('Failed to parse line:', e);
        }
    });
    return result;
}

function getAllCategories(data) {
    const categories = Object.keys(data).sort((a, b) => {
        const ai = CATALOG_ORDER.indexOf(a);
        const bi = CATALOG_ORDER.indexOf(b);
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    });
    const categoryCounts = {};
    categories.forEach(c => { categoryCounts[c] = data[c] ? data[c].length : 0; });
    return { sortedCategories: categories, categoryCounts };
}

function renderCategoryFilter({ sortedCategories, categoryCounts }) {
    const container = document.querySelector('.category-scroll');
    const total = Object.values(categoryCounts).reduce((s, v) => s + v, 0);
    container.innerHTML = `<button class="category-button ${currentCategory === 'all' ? 'active' : ''}" data-category="all">All<span class="category-count">${total}</span></button>`;
    sortedCategories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `category-button ${cat === currentCategory ? 'active' : ''}`;
        btn.innerHTML = `${cat}<span class="category-count">${categoryCounts[cat]}</span>`;
        btn.dataset.category = cat;
        btn.addEventListener('click', () => filterByCategory(cat));
        container.appendChild(btn);
    });
    container.querySelector('[data-category="all"]').addEventListener('click', () => filterByCategory('all'));
}

function filterByCategory(category) {
    currentCategory = category;
    document.querySelectorAll('.category-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    renderFilterTags();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderPapers();
}

function highlightMatches(text, terms, className = 'highlight-match') {
    if (!terms || !terms.length || !text) return text;
    let result = text;
    [...terms].sort((a, b) => b.length - a.length).forEach(term => {
        const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        result = result.replace(re, `<span class="${className}">$1</span>`);
    });
    return result;
}

function formatAuthorsForCard(authorsString, authorTerms = []) {
    if (!authorsString) return '';
    const arr = authorsString.split(',').map(s => s.trim()).filter(Boolean);
    if (!arr.length) return '';
    const hl = a => authorTerms.length > 0 ? highlightMatches(a, authorTerms, 'author-highlight') : a;
    if (arr.length <= 4) return arr.map(a => `<span class="author-item">${hl(a)}</span>`).join(', ');
    const first = arr.slice(0, 2).map(a => `<span class="author-item">${hl(a)}</span>`);
    const last = arr.slice(-2).map(a => `<span class="author-item">${hl(a)}</span>`);
    return [...first, '<span class="author-ellipsis">...</span>', ...last].join(', ');
}

function sourceLabel(paper) {
    if (paper.source_type === 'conference') {
        const parts = [paper.venue_name, paper.venue_year ? String(paper.venue_year) : ''].filter(Boolean);
        return parts.join(' ') || 'Conference';
    }
    return 'arXiv';
}

function renderPapers() {
    const container = document.getElementById('paperContainer');
    container.innerHTML = '';

    let papers = [];
    if (currentCategory === 'all') {
        getAllCategories(paperData).sortedCategories.forEach(cat => {
            if (paperData[cat]) papers = papers.concat(paperData[cat]);
        });
    } else if (paperData[currentCategory]) {
        papers = paperData[currentCategory];
    }

    let filtered = [...papers];
    filtered.forEach(p => { p.isMatched = false; p.matchReason = undefined; });

    const matchPaper = p => {
        const hay = [p.title, p.authors, p.summary, p.details, p.motivation, p.method, p.result, p.conclusion].join(' ').toLowerCase();
        return { keyword: activeKeywords.some(k => `${p.title} ${p.summary}`.toLowerCase().includes(k.toLowerCase())),
                 author: activeAuthors.some(a => p.authors.toLowerCase().includes(a.toLowerCase())),
                 text: textSearchQuery ? hay.includes(textSearchQuery.toLowerCase()) : false };
    };

    if (textSearchQuery) {
        filtered.sort((a, b) => {
            const am = matchPaper(a).text, bm = matchPaper(b).text;
            return am === bm ? 0 : am ? -1 : 1;
        });
        filtered.forEach(p => {
            const m = matchPaper(p);
            p.isMatched = m.text;
            if (p.isMatched) p.matchReason = [`text: ${textSearchQuery}`];
        });
    } else if (activeKeywords.length > 0 || activeAuthors.length > 0) {
        filtered.sort((a, b) => {
            const am = matchPaper(a), bm = matchPaper(b);
            const aM = am.keyword || am.author, bM = bm.keyword || bm.author;
            return aM === bM ? 0 : aM ? -1 : 1;
        });
        filtered.forEach(p => {
            const m = matchPaper(p);
            p.isMatched = m.keyword || m.author;
            if (p.isMatched) {
                p.matchReason = [];
                if (m.keyword) p.matchReason.push(`keyword: ${activeKeywords.filter(k => `${p.title} ${p.summary}`.toLowerCase().includes(k.toLowerCase())).join(', ')}`);
                if (m.author) p.matchReason.push(`author: ${activeAuthors.filter(a => p.authors.toLowerCase().includes(a.toLowerCase())).join(', ')}`);
            }
        });
    }

    currentFilteredPapers = [...filtered];

    if (!filtered.length) {
        container.innerHTML = `<div class="loading-container"><p>No papers found.</p></div>`;
        return;
    }

    filtered.forEach((paper, index) => {
        const card = document.createElement('div');
        card.className = `paper-card ${paper.isMatched ? 'matched-paper' : ''}`;
        card.dataset.id = paper.id || paper.url;

        const titleTerms = [...(activeKeywords.length ? activeKeywords : []), ...(textSearchQuery ? [textSearchQuery] : [])];
        const authorTerms = [...(activeAuthors.length ? activeAuthors : []), ...(textSearchQuery ? [textSearchQuery] : [])];
        const hlTitle = titleTerms.length ? highlightMatches(paper.title, titleTerms, 'keyword-highlight') : paper.title;
        const hlSummary = titleTerms.length ? highlightMatches(paper.summary, titleTerms, 'keyword-highlight') : paper.summary;
        const fmtAuthors = formatAuthorsForCard(paper.authors, authorTerms);

        const srcLabel = sourceLabel(paper);
        const srcClass = paper.source_type === 'conference' ? 'source-tag conference' : 'source-tag arxiv';

        card.innerHTML = `
            <div class="paper-card-index">${index + 1}</div>
            ${paper.isMatched ? '<div class="match-badge"></div>' : ''}
            <div class="paper-card-header">
                <h3 class="paper-card-title">${hlTitle}</h3>
                <p class="paper-card-authors">${fmtAuthors}</p>
                <div class="paper-card-categories">
                    <span class="category-tag catalog-tag">${paper.catalog}</span>
                    <span class="${srcClass}">${srcLabel}</span>
                    ${paper.category.map(c => `<span class="category-tag">${c}</span>`).join('')}
                </div>
            </div>
            <div class="paper-card-body">
                <p class="paper-card-summary">${hlSummary}</p>
                <div class="paper-card-footer">
                    <span class="paper-card-date">${formatDate(paper.date)}</span>
                    <span class="paper-card-link">Details</span>
                </div>
            </div>`;

        card.addEventListener('click', () => {
            currentPaperIndex = index;
            showPaperDetails(paper, index + 1);
        });
        container.appendChild(card);
    });
}

function showPaperDetails(paper, paperIndex) {
    const modal = document.getElementById('paperModal');
    const modalBody = document.getElementById('modalBody');
    modalBody.scrollTop = 0;

    const titleTerms = [...(activeKeywords.length ? activeKeywords : []), ...(textSearchQuery ? [textSearchQuery] : [])];
    const authorTerms = [...(activeAuthors.length ? activeAuthors : []), ...(textSearchQuery ? [textSearchQuery] : [])];

    const hlTitle = titleTerms.length ? highlightMatches(paper.title, titleTerms, 'keyword-highlight') : paper.title;
    const hlAuthors = authorTerms.length ? highlightMatches(paper.authors, authorTerms, 'author-highlight') : paper.authors;
    const hlSummary = titleTerms.length ? highlightMatches(paper.summary, titleTerms, 'keyword-highlight') : paper.summary;
    const hlAbstract = titleTerms.length ? highlightMatches(paper.details, titleTerms, 'keyword-highlight') : paper.details;
    const hlMotivation = paper.motivation && titleTerms.length ? highlightMatches(paper.motivation, titleTerms, 'keyword-highlight') : paper.motivation;
    const hlMethod = paper.method && titleTerms.length ? highlightMatches(paper.method, titleTerms, 'keyword-highlight') : paper.method;
    const hlResult = paper.result && titleTerms.length ? highlightMatches(paper.result, titleTerms, 'keyword-highlight') : paper.result;
    const hlConclusion = paper.conclusion && titleTerms.length ? highlightMatches(paper.conclusion, titleTerms, 'keyword-highlight') : paper.conclusion;

    const srcLabel = sourceLabel(paper);
    const srcClass = paper.source_type === 'conference' ? 'source-tag conference' : 'source-tag arxiv';
    const venueInfo = paper.source_type === 'conference' && paper.venue_track
        ? `<span class="venue-track-badge">${paper.venue_track.toUpperCase()}</span>`
        : '';

    document.getElementById('modalTitle').innerHTML =
        `${paperIndex ? `<span class="paper-index-badge">${paperIndex}</span> ` : ''}${hlTitle}`;

    modalBody.innerHTML = `
        <div class="paper-details ${paper.isMatched ? 'matched-paper-details' : ''}">
            <p><strong>Authors:</strong> ${hlAuthors}</p>
            <p><strong>Catalog:</strong> <span class="category-tag catalog-tag">${paper.catalog}</span>
               <span class="${srcClass}">${srcLabel}</span>${venueInfo}</p>
            ${paper.category.length ? `<p><strong>arXiv Categories:</strong> ${paper.category.map(c => `<span class="category-tag">${c}</span>`).join(' ')}</p>` : ''}
            <p><strong>Date:</strong> ${formatDate(paper.date)}</p>

            <h3>TL;DR</h3>
            <p>${hlSummary}</p>

            <div class="paper-sections">
                ${paper.motivation ? `<div class="paper-section"><h4>Motivation</h4><p>${hlMotivation}</p></div>` : ''}
                ${paper.method ? `<div class="paper-section"><h4>Method</h4><p>${hlMethod}</p></div>` : ''}
                ${paper.result ? `<div class="paper-section"><h4>Result</h4><p>${hlResult}</p></div>` : ''}
                ${paper.conclusion ? `<div class="paper-section"><h4>Conclusion</h4><p>${hlConclusion}</p></div>` : ''}
            </div>

            ${hlAbstract ? `<h3>Abstract</h3><p class="original-abstract">${hlAbstract}</p>` : ''}

            <div class="pdf-preview-section">
                <div class="pdf-header">
                    <h3>PDF Preview</h3>
                    <button class="pdf-expand-btn" onclick="togglePdfSize(this)">
                        <svg class="expand-icon" viewBox="0 0 24 24" width="24" height="24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
                        <svg class="collapse-icon" viewBox="0 0 24 24" width="24" height="24" style="display:none"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
                    </button>
                </div>
                <div class="pdf-container">
                    <iframe src="${paper.url.replace('abs', 'pdf')}" width="100%" height="800px" frameborder="0"></iframe>
                </div>
            </div>
        </div>`;

    document.getElementById('paperLink').href = paper.url;
    document.getElementById('pdfLink').href = paper.url.replace('abs', 'pdf');
    document.getElementById('htmlLink').href = paper.url.replace('abs', 'html');

    const githubLink = document.getElementById('githubLink');
    if (paper.code_url) {
        githubLink.href = paper.code_url;
        githubLink.style.display = 'flex';
    } else {
        githubLink.style.display = 'none';
    }

    const kimiPrompt = `Please read this paper ${paper.url.replace('abs', 'pdf')} and summarize the problem it solves, related work, research methods, experiments, results, and conclusions.`;
    document.getElementById('kimiChatLink').href = `https://www.kimi.com/_prefill_chat?prefill_prompt=${encodeURIComponent(kimiPrompt)}&send_immediately=true&force_search=true`;

    const pos = document.getElementById('paperPosition');
    if (pos) pos.textContent = `${currentPaperIndex + 1} / ${currentFilteredPapers.length}`;

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('modalBody').scrollTop = 0;
    document.getElementById('paperModal').classList.remove('active');
    document.body.style.overflow = '';
}

function navigateToPreviousPaper() {
    if (!currentFilteredPapers.length) return;
    currentPaperIndex = currentPaperIndex > 0 ? currentPaperIndex - 1 : currentFilteredPapers.length - 1;
    showPaperDetails(currentFilteredPapers[currentPaperIndex], currentPaperIndex + 1);
}

function navigateToNextPaper() {
    if (!currentFilteredPapers.length) return;
    currentPaperIndex = currentPaperIndex < currentFilteredPapers.length - 1 ? currentPaperIndex + 1 : 0;
    showPaperDetails(currentFilteredPapers[currentPaperIndex], currentPaperIndex + 1);
}

function showRandomPaper() {
    if (!currentFilteredPapers.length) return;
    currentPaperIndex = Math.floor(Math.random() * currentFilteredPapers.length);
    showPaperDetails(currentFilteredPapers[currentPaperIndex], currentPaperIndex + 1);
    const ind = document.createElement('div');
    ind.className = 'random-paper-indicator';
    ind.textContent = 'Random Paper';
    document.body.appendChild(ind);
    setTimeout(() => ind.remove(), 3000);
}

function toggleDatePicker() {
    const dp = document.getElementById('datePickerModal');
    dp.classList.toggle('active');
    document.body.style.overflow = dp.classList.contains('active') ? 'hidden' : '';
    if (dp.classList.contains('active') && flatpickrInstance) flatpickrInstance.setDate(currentDate, false);
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function togglePdfSize(button) {
    const pdfContainer = button.closest('.pdf-preview-section').querySelector('.pdf-container');
    const iframe = pdfContainer.querySelector('iframe');
    const expandIcon = button.querySelector('.expand-icon');
    const collapseIcon = button.querySelector('.collapse-icon');
    if (pdfContainer.classList.contains('expanded')) {
        pdfContainer.classList.remove('expanded');
        iframe.style.height = '800px';
        expandIcon.style.display = 'block';
        collapseIcon.style.display = 'none';
        const overlay = document.querySelector('.pdf-overlay');
        if (overlay) overlay.remove();
    } else {
        pdfContainer.classList.add('expanded');
        iframe.style.height = '90vh';
        expandIcon.style.display = 'none';
        collapseIcon.style.display = 'block';
        const overlay = document.createElement('div');
        overlay.className = 'pdf-overlay';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => togglePdfSize(button));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Submit Paper via GitHub API
// ─────────────────────────────────────────────────────────────────────────────

function openSubmitModal() {
    document.getElementById('submitModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('submitStatus').className = 'submit-status';
    document.getElementById('submitStatus').textContent = '';
    // Set default year to current year
    const yearInput = document.getElementById('sp_year');
    if (!yearInput.value) yearInput.value = new Date().getFullYear();
}

function closeSubmitModal() {
    document.getElementById('submitModal').classList.remove('active');
    document.body.style.overflow = '';
}

function slugify(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

async function submitPaper(e) {
    e.preventDefault();
    const statusEl = document.getElementById('submitStatus');
    const submitBtn = document.getElementById('doSubmitBtn');

    const title   = document.getElementById('sp_title').value.trim();
    const pdf     = document.getElementById('sp_pdf').value.trim();
    const abs     = document.getElementById('sp_abs').value.trim();
    const authors = document.getElementById('sp_authors').value.trim();
    const summary = document.getElementById('sp_summary').value.trim();
    const venue   = document.getElementById('sp_venue').value.trim();
    const year    = parseInt(document.getElementById('sp_year').value, 10);
    const catalog = document.getElementById('sp_catalog').value;

    if (!pdf && !abs) {
        statusEl.className = 'submit-status error';
        statusEl.textContent = '请至少填写 PDF URL 或 Abstract URL 中的一个。';
        return;
    }

    const token = localStorage.getItem('githubToken') || '';
    if (!token) {
        statusEl.className = 'submit-status error';
        statusEl.innerHTML = '未找到 GitHub Token。请先前往 <a href="settings.html">Settings</a> 页面保存 PAT。';
        return;
    }

    const ticket = {
        id: `${slugify(venue)}-${year}-${slugify(title)}`,
        title,
        authors: authors ? authors.split(',').map(s => s.trim()).filter(Boolean) : [],
        summary,
        pdf: pdf || undefined,
        abs: abs || undefined,
        venue_name: venue,
        venue_year: year,
        catalog,
        categories: [],
    };
    // Remove undefined fields
    Object.keys(ticket).forEach(k => ticket[k] === undefined && delete ticket[k]);

    const filename = `${ticket.id}.json`;
    const path     = `tickets/pending/${filename}`;
    const content  = btoa(unescape(encodeURIComponent(JSON.stringify(ticket, null, 2))));

    submitBtn.disabled = true;
    statusEl.className = 'submit-status info';
    statusEl.textContent = '正在提交到 GitHub…';

    try {
        const apiBase = `https://api.github.com/repos/${DATA_CONFIG.repoOwner}/${DATA_CONFIG.repoName}/contents/${path}`;
        const headers = {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
        };

        // Check if file already exists (to get SHA for update)
        let sha;
        const checkResp = await fetch(apiBase, { headers });
        if (checkResp.ok) {
            const existing = await checkResp.json();
            sha = existing.sha;
        }

        const body = {
            message: `ticket: add paper "${title.slice(0, 60)}"`,
            content,
            ...(sha ? { sha } : {}),
        };

        const resp = await fetch(apiBase, {
            method: 'PUT',
            headers,
            body: JSON.stringify(body),
        });

        if (resp.ok) {
            statusEl.className = 'submit-status success';
            statusEl.textContent = `✓ 提交成功！文件 ${filename} 已写入 tickets/pending/。下次 workflow 运行时将自动处理。`;
            document.getElementById('submitPaperForm').reset();
        } else {
            const err = await resp.json().catch(() => ({}));
            statusEl.className = 'submit-status error';
            statusEl.textContent = `提交失败 (${resp.status})：${err.message || '未知错误'}。请检查 PAT 权限（需要 Contents: Write）。`;
        }
    } catch (err) {
        statusEl.className = 'submit-status error';
        statusEl.textContent = `网络错误：${err.message}`;
    } finally {
        submitBtn.disabled = false;
    }
}

// Register submit modal event listeners after DOM ready
document.addEventListener('DOMContentLoaded', () => {
    const submitBtn = document.getElementById('submitPaperBtn');
    if (submitBtn) submitBtn.addEventListener('click', openSubmitModal);

    const closeBtn = document.getElementById('closeSubmitModal');
    if (closeBtn) closeBtn.addEventListener('click', closeSubmitModal);

    const cancelBtn = document.getElementById('cancelSubmitBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeSubmitModal);

    const submitModal = document.getElementById('submitModal');
    if (submitModal) {
        submitModal.addEventListener('click', e => {
            if (e.target === submitModal) closeSubmitModal();
        });
    }

    const form = document.getElementById('submitPaperForm');
    if (form) form.addEventListener('submit', submitPaper);
});
