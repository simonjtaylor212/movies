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
    selectedCity: 'all', // 'all', 'malaga', 'granada'
    selectedChain: 'all', // 'all', 'yelmo', 'cinesur', 'albeniz', 'kinepolis', 'megarama', 'ocine', 'renoir', 'golem', 'custom'
    selectedCinemas: [], // Array of selected cinema names. Empty means all.
    selectedLanguages: [], // Array of selected language names. Empty means all.
    searchQuery: '',
    viewMode: 'day', // 'day' or 'movie'
    onlyMovies: true
};

// --- MONTH NAMES IN ENGLISH ---
const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
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
            renderShowtimes();
        });
        
        scrollContainer.appendChild(card);
    });
}

// --- INITIALIZE FILTERS & SWITCHERS ---
function initFilters() {
    // Search filter
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        STATE.searchQuery = e.target.value.trim().toLowerCase();
        renderShowtimes();
    });
    
    // City Chips
    const cityChips = document.querySelectorAll('#cityChips .chip');
    cityChips.forEach(chip => {
        chip.addEventListener('click', () => {
            cityChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            STATE.selectedCity = chip.getAttribute('data-city');
            
            // When switching city, reset chain/cinema selection to prevent impossible filter states
            STATE.selectedChain = 'all';
            STATE.selectedCinemas = [];
            const chainChips = document.querySelectorAll('#cinemaChips .chip');
            chainChips.forEach(c => c.classList.remove('active'));
            document.getElementById('chipAll').classList.add('active');
            
            updateCinemaChainChips();
            updateCinemaSubChips();
            updateLanguageChips();
            renderShowtimes();
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
            updateCinemaSubChips();
            renderShowtimes();
        });
    });

    // View Mode Buttons
    const btnViewDay = document.getElementById('btnViewDay');
    const btnViewMovie = document.getElementById('btnViewMovie');
    const dateSelectorSection = document.getElementById('dateSelectorSection');

    btnViewDay.addEventListener('click', () => {
        if (STATE.viewMode === 'day') return;
        btnViewMovie.classList.remove('active');
        btnViewDay.classList.add('active');
        dateSelectorSection.style.display = 'block';
        STATE.viewMode = 'day';
        renderShowtimes();
    });

    btnViewMovie.addEventListener('click', () => {
        if (STATE.viewMode === 'movie') return;
        btnViewDay.classList.remove('active');
        btnViewMovie.classList.add('active');
        dateSelectorSection.style.display = 'none';
        STATE.viewMode = 'movie';
        renderShowtimes();
    });

    // Only Movies filter checkbox
    const chkOnlyMovies = document.getElementById('chkOnlyMovies');
    if (chkOnlyMovies) {
        chkOnlyMovies.checked = STATE.onlyMovies;
        chkOnlyMovies.addEventListener('change', (e) => {
            STATE.onlyMovies = e.target.checked;
            renderShowtimes();
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
                image: session.image || getPosterFallbackUrl(movieTitle),
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
            <div class="poster-container">
                <img class="movie-poster" src="${cardData.image}" alt="${cardData.movie} Poster" loading="lazy" onerror="this.src='data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27 width%3D%27200%27 height%3D%27300%27 viewBox%3D%270 0 200 300%27%3E%3Crect width%3D%27100%25%27 height%3D%27100%25%27 fill%3D%27%25231e293b%27%2F%3E%3Ctext x%3D%2750%25%27 y%3D%2750%25%27 dominant-baseline%3D%27middle%27 text-anchor%3D%27middle%27 fill%3D%27%252364748b%27 font-family%3D%27Outfit%27 font-size%3D%2714%27%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E'">
            </div>
            <div class="card-content">
                <h2 class="movie-title">${cardData.movie}</h2>
                ${cardData.original_title ? `<div class="movie-original-title">${cardData.original_title}</div>` : ''}
                <div class="movie-lang" title="${cardData.language}">
                    ${cardData.original_language ? `<span class="lang-badge">${cardData.original_language}</span>` : ''}${cardData.language}
                </div>
                <div class="showtimes-section">
                    <span class="showtimes-label">VOSE Showtimes:</span>
                    <div class="movie-date-cinemas">
                        ${cinemasHtml}
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
                image: session.image || getPosterFallbackUrl(groupKey),
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

    moviesArray.sort((a, b) => a.title.localeCompare(b.title));

    moviesArray.forEach(movieData => {
        const cardElement = document.createElement('article');
        cardElement.className = 'movie-card';

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
            <div class="poster-container">
                <img class="movie-poster" src="${movieData.image}" alt="${movieData.title} Poster" loading="lazy" onerror="this.src='data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27 width%3D%27200%27 height%3D%27300%27 viewBox%3D%270 0 200 300%27%3E%3Crect width%3D%27100%25%27 height%3D%27100%25%27 fill%3D%27%25231e293b%27%2F%3E%3Ctext x%3D%2750%25%27 y%3D%2750%25%27 dominant-baseline%3D%27middle%27 text-anchor%3D%27middle%27 fill%3D%27%252364748b%27 font-family%3D%27Outfit%27 font-size%3D%2714%27%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E'">
            </div>
            <div class="card-content">
                <h2 class="movie-title">${movieData.title}</h2>
                ${movieData.original_title ? `<div class="movie-original-title">${movieData.original_title}</div>` : ''}
                <div class="movie-lang" title="${movieData.language}">
                    ${movieData.original_language ? `<span class="lang-badge">${movieData.original_language}</span>` : ''}${movieData.language}
                </div>
                <div class="showtimes-section">
                    <span class="showtimes-label">All Screenings (VOSE):</span>
                    <div class="movie-dates-list">
                        ${datesHtml}
                    </div>
                </div>
            </div>
        `;

        grid.appendChild(cardElement);
    });
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
            else if (chain === 'cinesur') document.getElementById('chipCinesur').classList.add('active');
            else if (chain === 'albeniz') document.getElementById('chipAlbeniz').classList.add('active');
            else if (chain === 'kinepolis') document.getElementById('chipKinepolis').classList.add('active');
            else if (chain === 'megarama') document.getElementById('chipMegarama').classList.add('active');
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
        if (chain === 'cinesur') return 2;
        if (chain === 'albeniz') return 3;
        if (chain === 'kinepolis') return 4;
        if (chain === 'megarama') return 5;
        if (chain === 'ocine') return 6;
        if (chain === 'renoir') return 7;
        if (chain === 'golem') return 8;
        return 9;
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
            updateCinemaSubChips();
            renderShowtimes();
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
    if (chainClass === 'cinesur') return 'Cinesur';
    if (chainClass === 'albeniz') return 'Albéniz';
    if (chainClass === 'kinepolis') return 'Kinépolis';
    if (chainClass === 'megarama') return 'Megarama';
    if (chainClass === 'ocine') return 'Ocine';
    if (chainClass === 'renoir') return 'Cines Renoir';
    if (chainClass === 'golem') return 'Cines Golem';
    return 'Other';
}

function getChainFromCinema(cinemaName) {
    const name = cinemaName.toLowerCase();
    if (name.includes('yelmo')) return 'yelmo';
    if (name.includes('cinesur')) return 'cinesur';
    if (name.includes('albéniz') || name.includes('albeniz')) return 'albeniz';
    if (name.includes('kinepolis') || name.includes('kinépolis')) return 'kinepolis';
    if (name.includes('megarama')) return 'megarama';
    if (name.includes('ocine')) return 'ocine';
    if (name.includes('renoir')) return 'renoir';
    if (name.includes('golem')) return 'golem';
    return 'other';
}

function getCityFromCinema(cinemaName) {
    const name = cinemaName.toLowerCase();
    
    // Golem, Renoir & Cinesa are Madrid
    if (name.includes('golem') || name.includes('renoir') || name.includes('cinesa')) {
        return 'madrid';
    }
    
    // Kinépolis is in Granada and Madrid
    if (name.includes('kinepolis') || name.includes('kinépolis')) {
        if (name.includes('madrid')) {
            return 'madrid';
        }
        return 'granada';
    }
    
    // Yelmo is in Málaga and Madrid
    if (name.includes('yelmo')) {
        const madridYelmos = ['ideal', 'la vaguada', 'islazul', 'palafox luxury', 'premium parque corredor', 'plaza norte 2', 'planetocio', 'plenilunio', 'rivas h2o', 'tresaguas'];
        if (madridYelmos.some(y => name.includes(y))) {
            return 'madrid';
        }
        return 'malaga';
    }
    
    // Granada chains
    if (name.includes('megarama') || name.includes('ocine')) {
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

// Fallback poster based on movie name keyword to make the UI look rich even if posters fail
function normalizeTitle(t) {
    if (!t) return "";
    return t.toLowerCase()
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .replace(/[^a-z0-9]/g, "");
}

function getPosterFallbackUrl(movieTitle) {
    if (movieTitle.includes("revelación") || movieTitle.includes("revelaci")) {
        return "https://eu-static.yelmocines.es/content/img/movies/posters/6825/1/1/6825.jpg";
    }
    if (movieTitle.includes("Toy Story")) {
        return "https://eu-static.yelmocines.es/content/img/movies/posters/6767/1/1/6767.jpg";
    }
    if (movieTitle.includes("Obsession")) {
        return "https://eu-static.yelmocines.es/content/img/movies/posters/7102/1/1/7102.jpg";
    }
    if (movieTitle.includes("Supergirl")) {
        return "https://eu-static.yelmocines.es/content/img/movies/posters/7138/1/1/7138.jpg";
    }
    if (movieTitle.includes("Backrooms")) {
        return "https://eu-static.yelmocines.es/content/img/movies/posters/7089/1/1/7089.jpg";
    }
    if (movieTitle.includes("Scary Movie")) {
        return "https://eu-static.yelmocines.es/content/img/movies/posters/7080/1/1/7080.jpg";
    }
    
    return "";
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
            updateLanguageChips();
            renderShowtimes();
        });
        container.appendChild(chip);
    });
}
