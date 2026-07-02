// --- CONFIG & STATE ---
const CONFIG = {
    baseDate: (() => {
        const d = new Date();
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    })(), // Dynamically use today's date at UTC midnight
    apiEndpoint: 'api/v1/showtimes.json',
    translationsEndpoint: 'movie_title_translations.json'
};

const STATE = {
    allShowtimes: [],
    translations: {},
    selectedDateStr: '', // Format YYYY-MM-DD
    selectedCity: 'madrid', // 'malaga', 'granada', 'madrid', 'barcelona'
    selectedChain: 'all', // 'all', 'yelmo', 'cinesur', 'albeniz', 'kinepolis', 'ocine', 'renoir', 'golem', 'custom'
    selectedCinemas: [], // Array of selected cinema names. Empty means all.
    selectedLanguages: [], // Array of selected language names. Empty means all.
    searchQuery: '',
    viewMode: 'day', // 'day' or 'movie'
    onlyMovies: true,
    expandedMovies: [], // Array of movie titles
    isFiltersExpanded: true
};

const STORAGE_KEY = 'vose_spain_settings';
const SESSION_KEY = 'vose_spain_session';

function saveState() {
    const stateToSave = {
        selectedDateStr: STATE.selectedDateStr,
        selectedCity: STATE.selectedCity,
        selectedChain: STATE.selectedChain,
        selectedCinemas: STATE.selectedCinemas,
        selectedLanguages: STATE.selectedLanguages,
        searchQuery: STATE.searchQuery,
        viewMode: STATE.viewMode,
        onlyMovies: STATE.onlyMovies,
        expandedMovies: STATE.expandedMovies
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));

    // Session-only persistence for UI state
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        isFiltersExpanded: STATE.isFiltersExpanded
    }));
}

function loadState() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
        const parsed = JSON.parse(saved);
        if (parsed.selectedDateStr !== undefined) STATE.selectedDateStr = parsed.selectedDateStr;
        if (parsed.selectedCity !== undefined) STATE.selectedCity = parsed.selectedCity;
        if (parsed.selectedChain !== undefined) STATE.selectedChain = parsed.selectedChain;
        if (parsed.selectedCinemas !== undefined) STATE.selectedCinemas = parsed.selectedCinemas;
        if (parsed.selectedLanguages !== undefined) STATE.selectedLanguages = parsed.selectedLanguages;
        if (parsed.searchQuery !== undefined) STATE.searchQuery = parsed.searchQuery;
        if (parsed.viewMode !== undefined) STATE.viewMode = parsed.viewMode;
        if (parsed.onlyMovies !== undefined) STATE.onlyMovies = parsed.onlyMovies;
        if (parsed.expandedMovies !== undefined) STATE.expandedMovies = parsed.expandedMovies;
    } catch (e) {
        console.error('Error loading state from localStorage:', e);
    }

    const savedSession = sessionStorage.getItem(SESSION_KEY);
    if (savedSession) {
        try {
            const parsed = JSON.parse(savedSession);
            if (parsed.isFiltersExpanded !== undefined) STATE.isFiltersExpanded = parsed.isFiltersExpanded;
        } catch (e) {
            console.error('Error loading session state:', e);
        }
    } else {
        // Default based on screen size if no session state
        STATE.isFiltersExpanded = window.innerWidth > 768;
    }
}
// --- MONTH NAMES IN ENGLISH ---
const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    loadState();

    // Determine target city
    const urlCity = getCityFromURL();
    if (urlCity) {
        STATE.selectedCity = urlCity;
    } else {
        // If no city in URL and nothing was in localStorage, try to detect closest city
        if (!localStorage.getItem(STORAGE_KEY)) {
            detectClosestCity();
        }
    }

    // Ensure URL matches the current selected city
    updateURLCity(STATE.selectedCity);

    generateDateSelector();
    initFilters();
    loadShowtimes();
});

// --- GENERATE DATE CARDS DYNAMICALLY ---
function generateDateSelector() {
    const scrollContainer = document.getElementById('dateSelector');
    if (!scrollContainer) return;

    let uniqueDates = [];

    // Get today's date string representation (YYYY-MM-DD)
    const yyyyBase = CONFIG.baseDate.getUTCFullYear();
    const mmBase = String(CONFIG.baseDate.getUTCMonth() + 1).padStart(2, '0');
    const ddBase = String(CONFIG.baseDate.getUTCDate()).padStart(2, '0');
    const baseDateStr = `${yyyyBase}-${mmBase}-${ddBase}`;

    if (STATE.allShowtimes && STATE.allShowtimes.length > 0) {
        // Filter showtimes matching selected cinemas & search query (excluding date filter)
        const filteredShowtimes = STATE.allShowtimes.filter(item => {
            if (STATE.selectedCity !== 'all') {
                if (getCityFromCinema(item.cinema) !== STATE.selectedCity) return false;
            }
            
            if (STATE.selectedCinemas.length > 0) {
                if (!STATE.selectedCinemas.includes(item.cinema)) return false;
            }
            
            if (STATE.searchQuery) {
                const titleMatch = item.movie.toLowerCase().includes(STATE.searchQuery);
                const cinemaMatch = item.cinema.toLowerCase().includes(STATE.searchQuery);
                if (!titleMatch && !cinemaMatch) return false;
            }
            
            if (STATE.onlyMovies) {
                const isMovie = !item.projection_type || item.projection_type === 'Movie';
                if (!isMovie) return false;
            }

            if (STATE.selectedLanguages.length > 0) {
                const itemLang = item.original_language || 'Unknown';
                if (!STATE.selectedLanguages.includes(itemLang)) return false;
            }
            
            return true;
        });
        
        uniqueDates = [...new Set(filteredShowtimes.map(item => item.date).filter(Boolean))]
            .filter(dateStr => dateStr >= baseDateStr)
            .sort();
    }

    // If showtimes are not loaded yet, fallback to generating 14 default days starting from today
    if (uniqueDates.length === 0 && (!STATE.allShowtimes || STATE.allShowtimes.length === 0)) {
        for (let i = 0; i < 14; i++) {
            const date = new Date(CONFIG.baseDate);
            date.setUTCDate(date.getUTCDate() + i);
            
            const yyyy = date.getUTCFullYear();
            const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(date.getUTCDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            uniqueDates.push(dateStr);
        }
    }

    // Determine target selected date
    if (uniqueDates.length > 0) {
        if (!uniqueDates.includes(STATE.selectedDateStr)) {
            STATE.selectedDateStr = uniqueDates[0];
        }
    } else {
        STATE.selectedDateStr = '';
    }

    // Check if the rendered dates match uniqueDates to avoid rebuilding DOM and losing scroll position
    const currentCards = Array.from(scrollContainer.querySelectorAll('.date-card'));
    const currentDates = currentCards.map(c => c.getAttribute('data-date'));
    
    const datesMatch = currentDates.length === uniqueDates.length && 
                       currentDates.every((d, index) => d === uniqueDates[index]);

    if (datesMatch) {
        currentCards.forEach(card => {
            const cardDate = card.getAttribute('data-date');
            if (cardDate === STATE.selectedDateStr) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
        return;
    }

    // Rebuild the DOM
    scrollContainer.innerHTML = '';
    uniqueDates.forEach(dateStr => {
        const date = new Date(`${dateStr}T00:00:00Z`);
        
        const card = document.createElement('div');
        const isActive = (STATE.selectedDateStr === dateStr);
        card.className = `date-card ${isActive ? 'active' : ''}`;
        card.setAttribute('data-date', dateStr);
        
        const weekday = WEEKDAY_NAMES[date.getUTCDay()];
        const dayNum = date.getUTCDate();
        const monthLabel = MONTH_NAMES[date.getUTCMonth()].substring(0, 3).toUpperCase();
        
        card.innerHTML = `
            <span class="weekday">${weekday}</span>
            <span class="day-num">${dayNum}</span>
            <span class="month-lbl">${monthLabel}</span>
        `;
        
        card.addEventListener('click', () => {
            document.querySelectorAll('.date-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            STATE.selectedDateStr = dateStr;
            saveState();
            renderShowtimes();
        });
        
        scrollContainer.appendChild(card);
    });
}

// --- INITIALIZE FILTERS & SWITCHERS ---
function initFilters() {
    // Search filter
    const searchInput = document.getElementById('searchInput');
    if (STATE.searchQuery) {
        searchInput.value = STATE.searchQuery;
    }
    searchInput.addEventListener('input', (e) => {
        STATE.searchQuery = e.target.value.trim().toLowerCase();
        saveState();
        renderShowtimes();
        updateActiveFiltersSummary();
    });

    // Filter Toggle
    const filterToggle = document.getElementById('filterToggle');
    if (filterToggle) {
        filterToggle.addEventListener('click', () => {
            toggleFilters(!STATE.isFiltersExpanded);
        });
    }

    // Initial UI state for filters
    toggleFilters(STATE.isFiltersExpanded, false);
    updateActiveFiltersSummary();
    
    // Set active city chip based on state on load
    updateActiveCityChip();

    // City Chips
    const cityChips = document.querySelectorAll('#cityChips .chip');
    cityChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const city = chip.getAttribute('data-city');
            selectCity(city, true);
        });
    });

    // Cinema Chain Chips
    const chips = document.querySelectorAll('#cinemaChips .chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            STATE.selectedChain = chip.getAttribute('data-chain');
            
            if (STATE.selectedChain === 'all') {
                STATE.selectedCinemas = [];
            } else {
                // Select all cinemas belonging to this chain within the selected city
                STATE.selectedCinemas = [...new Set(STATE.allShowtimes
                    .filter(item => {
                        if (STATE.selectedCity !== 'all' && getCityFromCinema(item.cinema) !== STATE.selectedCity) return false;
                        return getChainFromCinema(item.cinema) === STATE.selectedChain;
                    })
                    .map(item => item.cinema)
                )];
            }
            saveState();
            updateCinemaSubChips();
            renderShowtimes();
            updateActiveFiltersSummary();
        });
    });

    // View Mode Buttons
    const btnViewDay = document.getElementById('btnViewDay');
    const btnViewMovie = document.getElementById('btnViewMovie');
    const dateSelectorSection = document.getElementById('dateSelectorSection');

    // Restore active view mode button
    if (STATE.viewMode === 'movie') {
        btnViewDay.classList.remove('active');
        btnViewMovie.classList.add('active');
        dateSelectorSection.style.display = 'none';
    }

    btnViewDay.addEventListener('click', () => {
        if (STATE.viewMode === 'day') return;
        btnViewMovie.classList.remove('active');
        btnViewDay.classList.add('active');
        dateSelectorSection.style.display = 'block';
        STATE.viewMode = 'day';
        saveState();
        renderShowtimes();
    });

    btnViewMovie.addEventListener('click', () => {
        if (STATE.viewMode === 'movie') return;
        btnViewDay.classList.remove('active');
        btnViewMovie.classList.add('active');
        dateSelectorSection.style.display = 'none';
        STATE.viewMode = 'movie';
        saveState();
        renderShowtimes();
    });

    // Only Movies filter checkbox
    const chkOnlyMovies = document.getElementById('chkOnlyMovies');
    if (chkOnlyMovies) {
        chkOnlyMovies.checked = STATE.onlyMovies;
        chkOnlyMovies.addEventListener('change', (e) => {
            STATE.onlyMovies = e.target.checked;
            saveState();
            renderShowtimes();
            updateActiveFiltersSummary();
        });
    }
}

// --- FETCH DATA FROM STATIC API ---
async function loadShowtimes() {
    const grid = document.getElementById('movieGrid');
    grid.innerHTML = `
        <div class="loader">
            <div class="spinner"></div>
        </div>
    `;
    
    try {
        // Fetch showtimes and translations concurrently
        const [showtimesRes, translationsRes] = await Promise.all([
            fetch(CONFIG.apiEndpoint),
            fetch(CONFIG.translationsEndpoint).catch(() => null)
        ]);
        
        if (!showtimesRes.ok) throw new Error('API fetch failed');
        STATE.allShowtimes = await showtimesRes.json();
        
        STATE.translations = {};
        STATE.normTranslations = {};
        if (translationsRes && translationsRes.ok) {
            try {
                STATE.translations = await translationsRes.json();
                for (let key in STATE.translations) {
                    STATE.normTranslations[normalizeTitle(key)] = STATE.translations[key];
                }
            } catch (err) {
                console.error('Error parsing translations:', err);
            }
        }
        
        updateCinemaChainChips(); // Initialize chain chips
        updateCinemaSubChips(); // Initialize sub-chips
        updateLanguageChips(); // Initialize language chips
        renderShowtimes();
        updateActiveFiltersSummary();
    } catch (error) {
        console.error('Error loading showtimes:', error);
        grid.innerHTML = `
            <div class="empty-state">
                <h3>Error loading showtimes</h3>
                <p>Could not connect to the static database server.</p>
            </div>
        `;
    }
}

// --- FILTER & RENDER ROUTER ---
function renderShowtimes() {
    if (STATE.viewMode === 'day') {
        renderDayView();
    } else {
        renderMovieView();
    }
}

function formatDateRange(dateStrings) {
    if (!dateStrings || dateStrings.length === 0) return '';
    const sorted = [...dateStrings].sort();

    const formatDate = (dateStr) => {
        const d = new Date(`${dateStr}T00:00:00Z`);
        return `${MONTH_NAMES[d.getUTCMonth()].substring(0, 3)} ${d.getUTCDate()}`;
    };

    if (sorted.length === 1) return formatDate(sorted[0]);
    return `${formatDate(sorted[0])} - ${formatDate(sorted[sorted.length - 1])}, ${new Date(`${sorted[0]}T00:00:00Z`).getUTCFullYear()}`;
}

function getCinemasSummary(movieData) {
    const cinemaNames = new Set();
    Object.values(movieData.dates).forEach(dateCinemas => {
        Object.keys(dateCinemas).forEach(cinemaName => {
            const cleanName = cinemaName.replace('Cine Yelmo ', '').replace('mk2 Cinesur ', '');
            cinemaNames.add(cleanName);
        });
    });
    return Array.from(cinemaNames).sort().join(', ');
}

function toggleMovieExpansion(movieTitle, cardElement) {
    const index = STATE.expandedMovies.indexOf(movieTitle);
    if (index > -1) {
        STATE.expandedMovies.splice(index, 1);
        cardElement.classList.remove('expanded');
    } else {
        STATE.expandedMovies.push(movieTitle);
        cardElement.classList.add('expanded');
    }
    saveState();
}

// --- RENDER DAY VIEW MODE ---
function renderDayView() {
    generateDateSelector(); // Update the date selector dynamically
    const grid = document.getElementById('movieGrid');
    grid.className = 'movie-grid list-by-movie'; // Apply list-by-movie layout
    grid.innerHTML = '';
    
    // 1. Filter by Date, Selected Cinemas, and Search
    const filtered = STATE.allShowtimes.filter(item => {
        if (item.date !== STATE.selectedDateStr) return false;
        
        if (STATE.selectedCity !== 'all') {
            if (getCityFromCinema(item.cinema) !== STATE.selectedCity) return false;
        }
        
        if (STATE.selectedCinemas.length > 0) {
            if (!STATE.selectedCinemas.includes(item.cinema)) return false;
        }
        
        if (STATE.searchQuery) {
            const titleMatch = item.movie.toLowerCase().includes(STATE.searchQuery);
            const cinemaMatch = item.cinema.toLowerCase().includes(STATE.searchQuery);
            if (!titleMatch && !cinemaMatch) return false;
        }
        
        if (STATE.onlyMovies) {
            const isMovie = !item.projection_type || item.projection_type === 'Movie';
            if (!isMovie) return false;
        }

        if (STATE.selectedLanguages.length > 0) {
            const itemLang = item.original_language || 'Unknown';
            if (!STATE.selectedLanguages.includes(itemLang)) return false;
        }
        
        return true;
    });
    
    // 2. Group by movie
    const grouped = {};
    const normMap = {}; // Map normalized titles to canonical titles

    filtered.forEach(session => {
        const movieTitle = session.movie;
        const normTitle = normalizeTitle(movieTitle);

        let groupKey = normMap[normTitle];
        if (!groupKey) {
            groupKey = movieTitle;
            normMap[normTitle] = groupKey;
        }

        if (!grouped[groupKey]) {
            grouped[groupKey] = {
                movie: groupKey,
                original_title: STATE.normTranslations[normTitle] || '',
                language: session.language,
                original_language: session.original_language || '',
                cinemas: {}
            };
        }
        
        const cinemaName = session.cinema;
        if (!grouped[groupKey].cinemas[cinemaName]) {
            grouped[groupKey].cinemas[cinemaName] = {
                showtimes: [],
                booking_url: session.booking_url
            };
        }
        
        if (!grouped[groupKey].cinemas[cinemaName].showtimes.includes(session.time)) {
            grouped[groupKey].cinemas[cinemaName].showtimes.push(session.time);
        }
    });

    const cardDataArray = Object.values(grouped);
    
    if (cardDataArray.length === 0) {
        renderEmptyState(grid);
        return;
    }
    
    cardDataArray.sort((a, b) => a.movie.localeCompare(b.movie));
    
    cardDataArray.forEach(cardData => {
        const cardElement = document.createElement('article');
        cardElement.className = 'movie-card';
        
        let cinemasHtml = '';
        const sortedCinemas = Object.keys(cardData.cinemas).sort();
        
        sortedCinemas.forEach(cinemaName => {
            const cinemaData = cardData.cinemas[cinemaName];
            const chainClass = getChainFromCinema(cinemaName);
            const displayCinema = cinemaName.replace('Cine Yelmo ', '').replace('mk2 Cinesur ', '');
            
            cinemaData.showtimes.sort();
            const timesHtml = cinemaData.showtimes.map(time => {
                if (cinemaData.booking_url) {
                    return `<a href="${cinemaData.booking_url}" target="_blank" class="time-pill">${time}</a>`;
                } else {
                    return `<span class="time-pill">${time}</span>`;
                }
            }).join('');
            
            cinemasHtml += `
                <div class="cinema-showtimes-row">
                    <span class="cinema-label"><span class="chain-badge ${chainClass}" style="position:static; margin-right:6px; padding: 2px 6px; font-size: 0.65rem;">${getDisplayChain(chainClass)}</span> ${displayCinema}</span>
                    <div class="showtimes-list">
                        ${timesHtml}
                    </div>
                </div>
            `;
        });

        cardElement.innerHTML = `
            <div class="card-content">
                <h3 class="movie-title">${cardData.movie}</h3>
                ${cardData.original_title ? `<div class="movie-original-title">${cardData.original_title}</div>` : ''}
                <div class="movie-lang" title="${cardData.language}">
                    ${cardData.original_language ? `<span class="lang-badge">${cardData.original_language}</span>` : ''}${cardData.language}
                </div>
                <div class="expanded-content">
                    <div class="showtimes-section">
                        <span class="showtimes-label">VOSE Showtimes:</span>
                        <div class="movie-date-cinemas">
                            ${cinemasHtml}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        grid.appendChild(cardElement);
    });
}

// --- RENDER MOVIE VIEW MODE ---
function renderMovieView() {
    const grid = document.getElementById('movieGrid');
    grid.className = 'movie-grid list-by-movie'; // Apply custom movie list layout
    grid.innerHTML = '';
    
    // 1. Filter by Selected Cinemas and Search Query (ALL DATES included)
    const filtered = STATE.allShowtimes.filter(item => {
        if (STATE.selectedCity !== 'all') {
            if (getCityFromCinema(item.cinema) !== STATE.selectedCity) return false;
        }
        
        if (STATE.selectedCinemas.length > 0) {
            if (!STATE.selectedCinemas.includes(item.cinema)) return false;
        }
        
        if (STATE.searchQuery) {
            const titleMatch = item.movie.toLowerCase().includes(STATE.searchQuery);
            const cinemaMatch = item.cinema.toLowerCase().includes(STATE.searchQuery);
            if (!titleMatch && !cinemaMatch) return false;
        }
        
        if (STATE.onlyMovies) {
            const isMovie = !item.projection_type || item.projection_type === 'Movie';
            if (!isMovie) return false;
        }

        if (STATE.selectedLanguages.length > 0) {
            const itemLang = item.original_language || 'Unknown';
            if (!STATE.selectedLanguages.includes(itemLang)) return false;
        }
        
        return true;
    });

    // 2. Group by Movie
    const moviesGrouped = {};
    const normMap = {}; // Map normalized titles to canonical titles

    filtered.forEach(session => {
        const movieTitle = session.movie;
        const normTitle = normalizeTitle(movieTitle);

        let groupKey = normMap[normTitle];
        if (!groupKey) {
            groupKey = movieTitle;
            normMap[normTitle] = groupKey;
        }

        if (!moviesGrouped[groupKey]) {
            moviesGrouped[groupKey] = {
                title: groupKey,
                original_title: STATE.normTranslations[normTitle] || '',
                language: session.language, // Keep language sample
                original_language: session.original_language || '',
                dates: {} // Grouped showtimes by date
            };
        }

        const dateStr = session.date;
        if (!moviesGrouped[groupKey].dates[dateStr]) {
            moviesGrouped[groupKey].dates[dateStr] = {}; // Grouped by cinema on this date
        }

        const cinemaName = session.cinema;
        if (!moviesGrouped[groupKey].dates[dateStr][cinemaName]) {
            moviesGrouped[groupKey].dates[dateStr][cinemaName] = {
                showtimes: [],
                booking_url: session.booking_url
            };
        }

        if (!moviesGrouped[groupKey].dates[dateStr][cinemaName].showtimes.includes(session.time)) {
            moviesGrouped[groupKey].dates[dateStr][cinemaName].showtimes.push(session.time);
        }
    });

    const moviesArray = Object.values(moviesGrouped);
    if (moviesArray.length === 0) {
        renderEmptyState(grid);
        return;
    }

    // 3. Partition and Sort
    const cutoffDate = new Date(CONFIG.baseDate);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() + 7);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    const showingThisWeek = [];
    const comingSoon = [];

    moviesArray.forEach(movie => {
        const sortedDates = Object.keys(movie.dates).sort();
        movie.earliestDate = sortedDates[0];

        if (movie.earliestDate < cutoffDateStr) {
            showingThisWeek.push(movie);
        } else {
            comingSoon.push(movie);
        }
    });

    showingThisWeek.sort((a, b) => a.title.localeCompare(b.title));
    comingSoon.sort((a, b) => a.title.localeCompare(b.title));

    // 4. Render Sections
    const renderSection = (title, movies) => {
        if (movies.length === 0) return;

        const section = document.createElement('div');
        section.className = 'movie-view-section';

        const sectionTitle = document.createElement('h2');
        sectionTitle.className = 'section-title';
        sectionTitle.textContent = title;
        section.appendChild(sectionTitle);

        const sectionGrid = document.createElement('div');
        sectionGrid.className = 'movie-grid'; // Use standard grid for cards
        section.appendChild(sectionGrid);

        movies.forEach(movieData => {
            const isExpanded = STATE.expandedMovies.includes(movieData.title);
            const cardElement = document.createElement('article');
            cardElement.className = `movie-card collapsible ${isExpanded ? 'expanded' : ''}`;
            cardElement.tabIndex = 0;
            cardElement.setAttribute('role', 'button');
            cardElement.setAttribute('aria-expanded', isExpanded);

            // Build HTML for dates and their cinema showtimes
            let datesHtml = '';
            const sortedDates = Object.keys(movieData.dates).sort();

            sortedDates.forEach(dateStr => {
                const formattedDate = formatDateString(dateStr);
                const cinemas = movieData.dates[dateStr];
                let cinemasHtml = '';

                Object.entries(cinemas).forEach(([cinemaName, cinemaData]) => {
                    const chainClass = getChainFromCinema(cinemaName);
                    const displayCinema = cinemaName.replace('Cine Yelmo ', '').replace('mk2 Cinesur ', '');

                    cinemaData.showtimes.sort();
                    const timesHtml = cinemaData.showtimes.map(time => {
                        if (cinemaData.booking_url) {
                            return `<a href="${cinemaData.booking_url}" target="_blank" class="time-pill" onclick="event.stopPropagation()">${time}</a>`;
                        } else {
                            return `<span class="time-pill">${time}</span>`;
                        }
                    }).join('');

                    cinemasHtml += `
                        <div class="cinema-showtimes-row">
                            <span class="cinema-label"><span class="chain-badge ${chainClass}" style="position:static; margin-right:6px; padding: 2px 6px; font-size: 0.65rem;">${getDisplayChain(chainClass)}</span> ${displayCinema}</span>
                            <div class="showtimes-list">
                                ${timesHtml}
                            </div>
                        </div>
                    `;
                });

                datesHtml += `
                    <div class="movie-date-group">
                        <span class="movie-date-title">${formattedDate}</span>
                        <div class="movie-date-cinemas">
                            ${cinemasHtml}
                        </div>
                    </div>
                `;
            });

            cardElement.innerHTML = `
                <div class="card-content">
                    <div class="card-header">
                        <div style="flex-grow: 1; min-width: 0;">
                            <h3 class="movie-title">${movieData.title}</h3>
                            ${movieData.original_title ? `<div class="movie-original-title">${movieData.original_title}</div>` : ''}
                            <div class="movie-lang" title="${movieData.language}">
                                ${movieData.original_language ? `<span class="lang-badge">${movieData.original_language}</span>` : ''}${movieData.language}
                            </div>
                        </div>
                        <div class="toggle-icon">
                            <i class="fa-solid fa-chevron-down"></i>
                        </div>
                    </div>

                    <div class="collapsed-content">
                        <div class="summary-item">
                            <i class="fa-solid fa-calendar-days"></i>
                            <span>${formatDateRange(sortedDates)}</span>
                        </div>
                        <div class="summary-item">
                            <i class="fa-solid fa-location-dot"></i>
                            <span>${getCinemasSummary(movieData)}</span>
                        </div>
                    </div>

                    <div class="expanded-content">
                        <div class="showtimes-section">
                            <span class="showtimes-label">All Screenings (VOSE):</span>
                            <div class="movie-dates-list">
                                ${datesHtml}
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const toggleHandler = (e) => {
                // Prevent toggling if a link (booking_url) was clicked
                if (e.target.closest('a')) return;

                toggleMovieExpansion(movieData.title, cardElement);
                cardElement.setAttribute('aria-expanded', cardElement.classList.contains('expanded'));
            };

            cardElement.addEventListener('click', toggleHandler);
            cardElement.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleHandler(e);
                }
            });

            sectionGrid.appendChild(cardElement);
        });

        grid.appendChild(section);
    };

    renderSection('Showing this week', showingThisWeek);
    renderSection('Coming soon', comingSoon);
}

// --- DYNAMIC SUB-FILTER GENERATION ---
function updateChainChipsActiveState() {
    const chips = document.querySelectorAll('#cinemaChips .chip');
    chips.forEach(c => c.classList.remove('active'));
    
    if (STATE.selectedCinemas.length === 0) {
        document.getElementById('chipAll').classList.add('active');
        STATE.selectedChain = 'all';
        return;
    }
    
    // Check if the current selection corresponds exactly to one chain's full set
    const selectedChains = [...new Set(STATE.selectedCinemas.map(getChainFromCinema))];
    if (selectedChains.length === 1) {
        const chain = selectedChains[0];
        const allChainCinemas = [...new Set(STATE.allShowtimes
            .filter(item => getChainFromCinema(item.cinema) === chain)
            .map(item => item.cinema)
        )];
        
        const isAllChainCinemasSelected = allChainCinemas.every(c => STATE.selectedCinemas.includes(c));
        
        if (isAllChainCinemasSelected) {
            STATE.selectedChain = chain;
            if (chain === 'yelmo') document.getElementById('chipYelmo').classList.add('active');
            else if (chain === 'cinesa') document.getElementById('chipCinesa').classList.add('active');
            else if (chain === 'cinesur') document.getElementById('chipCinesur').classList.add('active');
            else if (chain === 'albeniz') document.getElementById('chipAlbeniz').classList.add('active');
            else if (chain === 'kinepolis') document.getElementById('chipKinepolis').classList.add('active');
            else if (chain === 'ocine') document.getElementById('chipOcine').classList.add('active');
            else if (chain === 'renoir') document.getElementById('chipRenoir').classList.add('active');
            else if (chain === 'golem') document.getElementById('chipGolem').classList.add('active');
            return;
        }
    }
    
    STATE.selectedChain = 'custom';
}

function updateCinemaChainChips() {
    const chainChips = document.querySelectorAll('#cinemaChips .chip');
    if (STATE.selectedCity === 'all') {
        chainChips.forEach(chip => {
            chip.style.display = 'inline-block';
        });
        return;
    }
    
    // Determine which chains exist in the selected city
    const chainsInCity = new Set();
    STATE.allShowtimes.forEach(item => {
        if (getCityFromCinema(item.cinema) === STATE.selectedCity) {
            chainsInCity.add(getChainFromCinema(item.cinema));
        }
    });
    
    // Show/hide chips based on presence in city
    chainChips.forEach(chip => {
        const chain = chip.getAttribute('data-chain');
        if (chain === 'all' || chainsInCity.has(chain)) {
            chip.style.display = 'inline-block';
        } else {
            chip.style.display = 'none';
        }
    });
}

function updateCinemaSubChips() {
    const subChipsContainer = document.getElementById('cinemaSubChips');
    subChipsContainer.innerHTML = '';
    
    // Get all unique cinemas from showtimes matching selected city
    const filteredShowtimesForSubChips = STATE.allShowtimes.filter(item => {
        if (STATE.selectedCity !== 'all') {
            return getCityFromCinema(item.cinema) === STATE.selectedCity;
        }
        return true;
    });
    
    const uniqueCinemas = [...new Set(filteredShowtimesForSubChips.map(item => item.cinema))];
    if (uniqueCinemas.length === 0) return;
    
    // Sort cinemas: Yelmo first, Cinesur second, Albéniz third, then Granada chains, then alphabetically
    const getChainPriority = (cinemaName) => {
        const chain = getChainFromCinema(cinemaName);
        if (chain === 'yelmo') return 1;
        if (chain === 'cinesa') return 2;
        if (chain === 'cinesur') return 3;
        if (chain === 'albeniz') return 4;
        if (chain === 'kinepolis') return 5;
        if (chain === 'ocine') return 6;
        if (chain === 'renoir') return 7;
        if (chain === 'golem') return 8;
        return 10;
    };
    
    uniqueCinemas.sort((a, b) => {
        const priorityA = getChainPriority(a);
        const priorityB = getChainPriority(b);
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        return a.localeCompare(b);
    });
    
    uniqueCinemas.forEach(cinemaName => {
        const chain = getChainFromCinema(cinemaName);
        const isSelected = STATE.selectedCinemas.includes(cinemaName);
        
        const chip = document.createElement('button');
        chip.className = `chip active-chain-${chain} ${isSelected ? 'active' : ''}`;
        
        // Clean display name
        const displayCinema = cinemaName.replace('Cine Yelmo ', '').replace('mk2 Cinesur ', '');
        chip.textContent = displayCinema;
        
        // Premium border indicator matching the chain color
        chip.style.borderLeft = `3px solid var(--${chain}-color)`;
        
        chip.addEventListener('click', () => {
            const index = STATE.selectedCinemas.indexOf(cinemaName);
            if (index > -1) {
                // Toggle off
                STATE.selectedCinemas.splice(index, 1);
            } else {
                // Toggle on
                STATE.selectedCinemas.push(cinemaName);
            }
            
            updateChainChipsActiveState();
            saveState();
            updateCinemaSubChips();
            renderShowtimes();
            updateActiveFiltersSummary();
        });
        subChipsContainer.appendChild(chip);
    });
}

// --- RENDERING HELPERS ---
function renderEmptyState(container) {
    container.innerHTML = `
        <div class="empty-state">
            <h3>No VOSE showtimes found</h3>
            <p>Try changing the date, clearing the search query, or selecting another chain.</p>
        </div>
    `;
}

function getDisplayChain(chainClass) {
    if (chainClass === 'yelmo') return 'Yelmo';
    if (chainClass === 'cinesa') return 'Cinesa';
    if (chainClass === 'cinesur') return 'Cinesur';
    if (chainClass === 'albeniz') return 'Albéniz';
    if (chainClass === 'kinepolis') return 'Kinépolis';
    if (chainClass === 'ocine') return 'Ocine';
    if (chainClass === 'renoir') return 'Cines Renoir';
    if (chainClass === 'golem') return 'Cines Golem';
    return 'Other';
}

function getChainFromCinema(cinemaName) {
    const name = cinemaName.toLowerCase();
    if (name.includes('yelmo')) return 'yelmo';
    if (name.includes('cinesa')) return 'cinesa';
    if (name.includes('cinesur')) return 'cinesur';
    if (name.includes('albéniz') || name.includes('albeniz')) return 'albeniz';
    if (name.includes('kinepolis') || name.includes('kinépolis')) return 'kinepolis';
    if (name.includes('ocine')) return 'ocine';
    if (name.includes('renoir')) return 'renoir';
    if (name.includes('golem')) return 'golem';
    return 'other';
}

function getCityFromCinema(cinemaName) {
    const name = cinemaName.toLowerCase();
    
    // Renoir Floridablanca is Barcelona
    if (name.includes('floridablanca')) {
        return 'barcelona';
    }
    
    // Golem and remaining Renoir are Madrid
    if (name.includes('golem') || name.includes('renoir')) {
        return 'madrid';
    }
    
    // Cinesa is in Madrid and Barcelona
    if (name.includes('cinesa')) {
        if (name.includes('la farga') || name.includes('diagonal') || name.includes('som multiespai') || name.includes('parc vallès') || name.includes('parc valles') || name.includes('barnasud')) {
            return 'barcelona';
        }
        return 'madrid';
    }
    
    // Kinépolis is in Granada and Madrid
    if (name.includes('kinepolis') || name.includes('kinépolis')) {
        if (name.includes('madrid')) {
            return 'madrid';
        }
        return 'granada';
    }
    
    // Yelmo is in Málaga, Madrid, and Barcelona
    if (name.includes('yelmo')) {
        const madridYelmos = ['ideal', 'la vaguada', 'islazul', 'palafox luxury', 'premium parque corredor', 'plaza norte 2', 'planetocio', 'plenilunio', 'rivas h2o', 'tresaguas'];
        const barcelonaYelmos = ['castelldefels', 'abrera', 'baricentro', 'maquinista', 'sant cugat'];
        if (madridYelmos.some(y => name.includes(y))) {
            return 'madrid';
        }
        if (barcelonaYelmos.some(y => name.includes(y))) {
            return 'barcelona';
        }
        return 'malaga';
    }
    
    // Granada chains
    if (name.includes('ocine')) {
        return 'granada';
    }
    
    // Málaga chains (Cine Albéniz, Cinesur)
    return 'malaga';
}

// Formatting YYYY-MM-DD to "Sunday, June 14"
function formatDateString(dateStr) {
    const dateObj = new Date(`${dateStr}T00:00:00Z`);
    const dayName = WEEKDAY_NAMES[dateObj.getUTCDay()];
    const dayNum = dateObj.getUTCDate();
    const monthName = MONTH_NAMES[dateObj.getUTCMonth()];
    
    // Check if it matches today/tomorrow for user convenience
    const today = new Date(CONFIG.baseDate);
    const tomorrow = new Date(CONFIG.baseDate);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const checkDate = dateObj.toISOString().substring(0,10);
    const todayStr = today.toISOString().substring(0,10);
    const tomorrowStr = tomorrow.toISOString().substring(0,10);

    if (checkDate === todayStr) {
        return `Today (${dayName}, ${monthName} ${dayNum})`;
    } else if (checkDate === tomorrowStr) {
        return `Tomorrow (${dayName}, ${monthName} ${dayNum})`;
    }

    return `${dayName}, ${monthName} ${dayNum}`;
}

// Helper to normalize movie titles
function normalizeTitle(t) {
    if (!t) return "";
    return t.toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]/g, "");
}

function updateLanguageChips() {
    const container = document.getElementById('languageChips');
    if (!container) return;
    container.innerHTML = '';
    
    // Get all unique languages from showtimes
    const uniqueLangs = [...new Set(STATE.allShowtimes.map(item => item.original_language || 'Unknown'))];
    
    // Sort: English first, then others alphabetically, then Unknown last
    uniqueLangs.sort((a, b) => {
        if (a === 'English') return -1;
        if (b === 'English') return 1;
        if (a === 'Unknown') return 1;
        if (b === 'Unknown') return -1;
        return a.localeCompare(b);
    });
    
    uniqueLangs.forEach(langName => {
        const isSelected = STATE.selectedLanguages.includes(langName);
        const chip = document.createElement('button');
        chip.className = `chip ${isSelected ? 'active' : ''}`;
        chip.textContent = langName;
        
        chip.addEventListener('click', () => {
            const index = STATE.selectedLanguages.indexOf(langName);
            if (index > -1) {
                STATE.selectedLanguages.splice(index, 1);
            } else {
                STATE.selectedLanguages.push(langName);
            }
            saveState();
            updateLanguageChips();
            renderShowtimes();
            updateActiveFiltersSummary();
        });
        container.appendChild(chip);
    });
}

// --- CITY ROUTING & GEOLOCATION ---
const VALID_CITIES = ['malaga', 'granada', 'madrid', 'barcelona'];

function getCityFromURL() {
    const params = new URLSearchParams(window.location.search);
    const city = params.get('city');
    if (city && VALID_CITIES.includes(city.toLowerCase())) {
        return city.toLowerCase();
    }
    return null;
}

function updateURLCity(city) {
    const url = new URL(window.location);
    if (url.searchParams.get('city') !== city) {
        url.searchParams.set('city', city);
        window.history.replaceState({}, '', url);
    }
}

function updateActiveFiltersSummary() {
    const summaryContainer = document.getElementById('activeFiltersSummary');
    if (!summaryContainer) return;
    summaryContainer.innerHTML = '';

    const addChip = (label, onClear, targetId) => {
        const chip = document.createElement('div');
        chip.className = 'chip active';
        chip.style.display = 'flex';
        chip.style.alignItems = 'center';
        chip.style.gap = '8px';
        chip.style.fontSize = '0.75rem';
        chip.style.padding = '6px 12px';

        const text = document.createElement('span');
        text.textContent = label;
        text.style.cursor = 'pointer';
        text.addEventListener('click', () => {
            if (!STATE.isFiltersExpanded) {
                toggleFilters(true);
            }
            if (targetId) {
                const target = document.getElementById(targetId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.focus();
                }
            }
        });

        const clearBtn = document.createElement('i');
        clearBtn.className = 'fa-solid fa-xmark';
        clearBtn.style.cursor = 'pointer';
        clearBtn.setAttribute('aria-label', `Clear ${label} filter`);
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            onClear();
        });

        chip.appendChild(text);
        chip.appendChild(clearBtn);
        summaryContainer.appendChild(chip);
    };

    // 1. City Chip (always selected, but we show it as a chip when collapsed)
    if (!STATE.isFiltersExpanded) {
        const cityLabel = document.querySelector(`#cityChips .chip[data-city="${STATE.selectedCity}"]`)?.textContent || STATE.selectedCity;
        addChip(`City: ${cityLabel}`, () => {}, 'cityChips');
    }

    // 2. Chain Chip
    if (STATE.selectedChain !== 'all') {
        const chainLabel = getDisplayChain(STATE.selectedChain);
        addChip(`Chain: ${chainLabel}`, () => {
            STATE.selectedChain = 'all';
            STATE.selectedCinemas = [];
            updateChainChipsActiveState();
            saveState();
            updateCinemaChainChips();
            updateCinemaSubChips();
            renderShowtimes();
            updateActiveFiltersSummary();
        }, 'cinemaChips');
    }

    // 3. Cinemas Chips (if custom)
    if (STATE.selectedChain === 'custom' && STATE.selectedCinemas.length > 0) {
        if (STATE.selectedCinemas.length <= 2) {
            STATE.selectedCinemas.forEach(cinema => {
                const shortName = cinema.replace('Cine Yelmo ', '').replace('mk2 Cinesur ', '');
                addChip(shortName, () => {
                    STATE.selectedCinemas = STATE.selectedCinemas.filter(c => c !== cinema);
                    updateChainChipsActiveState();
                    saveState();
                    updateCinemaSubChips();
                    renderShowtimes();
                    updateActiveFiltersSummary();
                }, 'cinemaSubChips');
            });
        } else {
            addChip(`${STATE.selectedCinemas.length} Cinemas`, () => {
                STATE.selectedCinemas = [];
                updateChainChipsActiveState();
                saveState();
                updateCinemaSubChips();
                renderShowtimes();
                updateActiveFiltersSummary();
            }, 'cinemaSubChips');
        }
    }

    // 4. Languages Chips
    if (STATE.selectedLanguages.length > 0) {
        if (STATE.selectedLanguages.length <= 2) {
            STATE.selectedLanguages.forEach(lang => {
                addChip(lang, () => {
                    STATE.selectedLanguages = STATE.selectedLanguages.filter(l => l !== lang);
                    saveState();
                    updateLanguageChips();
                    renderShowtimes();
                    updateActiveFiltersSummary();
                }, 'languageChips');
            });
        } else {
            addChip(`${STATE.selectedLanguages.length} Languages`, () => {
                STATE.selectedLanguages = [];
                saveState();
                updateLanguageChips();
                renderShowtimes();
                updateActiveFiltersSummary();
            }, 'languageChips');
        }
    }

    // 5. Search Chip
    if (STATE.searchQuery) {
        addChip(`Search: ${STATE.searchQuery}`, () => {
            STATE.searchQuery = '';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';
            saveState();
            renderShowtimes();
            updateActiveFiltersSummary();
        }, 'searchInput');
    }

    // 6. Only Movies Chip (if unchecked)
    if (!STATE.onlyMovies) {
        addChip('Show all (events incl.)', () => {
            STATE.onlyMovies = true;
            const chk = document.getElementById('chkOnlyMovies');
            if (chk) chk.checked = true;
            saveState();
            renderShowtimes();
            updateActiveFiltersSummary();
        }, 'chkOnlyMovies');
    }
}

function toggleFilters(isExpanded, animate = true) {
    const panel = document.getElementById('filterPanel');
    const toggle = document.getElementById('filterToggle');
    if (!panel || !toggle) return;

    STATE.isFiltersExpanded = isExpanded;
    saveState();

    toggle.setAttribute('aria-expanded', isExpanded);

    if (!animate) {
        const originalTransition = panel.style.transition;
        panel.style.transition = 'none';
        if (isExpanded) {
            panel.classList.remove('collapsed');
        } else {
            panel.classList.add('collapsed');
        }
        // Force reflow
        panel.offsetHeight;
        panel.style.transition = originalTransition;
    } else {
        if (isExpanded) {
            panel.classList.remove('collapsed');
        } else {
            panel.classList.add('collapsed');
        }
    }
    updateActiveFiltersSummary();
}

function selectCity(city, pushToHistory = false) {
    STATE.selectedCity = city;
    saveState();
    
    // Update URL query parameters
    const url = new URL(window.location);
    if (url.searchParams.get('city') !== city) {
        url.searchParams.set('city', city);
        if (pushToHistory) {
            window.history.pushState({}, '', url);
        } else {
            window.history.replaceState({}, '', url);
        }
    }

    // Update active city chip styling
    updateActiveCityChip();

    // Reset chains/cinemas to prevent invalid states
    STATE.selectedChain = 'all';
    STATE.selectedCinemas = [];
    const chainChips = document.querySelectorAll('#cinemaChips .chip');
    chainChips.forEach(c => c.classList.remove('active'));
    const chipAll = document.getElementById('chipAll');
    if (chipAll) chipAll.classList.add('active');
    
    // Re-initialize sub-filters based on the new city
    updateCinemaChainChips();
    updateCinemaSubChips();
    updateLanguageChips();
    renderShowtimes();
    updateActiveFiltersSummary();
}

function updateActiveCityChip() {
    const cityChips = document.querySelectorAll('#cityChips .chip');
    cityChips.forEach(chip => {
        if (chip.getAttribute('data-city') === STATE.selectedCity) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });
}

const CITY_COORDS = {
    malaga: { lat: 36.7212, lon: -4.4214 },
    granada: { lat: 37.1773, lon: -3.5986 },
    madrid: { lat: 40.4168, lon: -3.7037 },
    barcelona: { lat: 41.3851, lon: 2.1734 }
};

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function findClosestCity(lat, lon) {
    let closest = 'madrid';
    let minDist = Infinity;
    for (const [city, coords] of Object.entries(CITY_COORDS)) {
        const dist = getDistance(lat, lon, coords.lat, coords.lon);
        if (dist < minDist) {
            minDist = dist;
            closest = city;
        }
    }
    return closest;
}

async function detectClosestCity() {
    // 1. IP Geolocation (automatic, no permission prompt)
    try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
            const data = await res.json();
            if (data.latitude && data.longitude) {
                const closest = findClosestCity(data.latitude, data.longitude);
                if (closest && closest !== STATE.selectedCity) {
                    selectCity(closest, false);
                }
                return;
            }
        }
    } catch (e) {
        console.warn('IP Geolocation failed:', e);
    }

    // 2. Browser Geolocation (fallback, requests permission)
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const closest = findClosestCity(lat, lon);
            if (closest && closest !== STATE.selectedCity) {
                selectCity(closest, false);
            }
        }, (err) => {
            console.warn('Browser Geolocation error:', err);
        });
    }
}
