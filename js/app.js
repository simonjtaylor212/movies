// --- CONFIG & STATE ---
const CONFIG = {
    baseDate: (() => {
        const d = new Date();
        return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    })(), // Dynamically use today's date at UTC midnight
    apiEndpoint: 'api/v1/showtimes.json'
};

const STATE = {
    allShowtimes: [],
    selectedDateStr: '', // Format YYYY-MM-DD
    selectedChain: 'all', // 'all', 'yelmo', 'cinesur', 'albeniz'
    selectedCinema: 'all', // 'all' or specific cinema name
    searchQuery: '',
    viewMode: 'day' // 'day' or 'movie'
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

// --- GENERATE 14 DATE CARDS ---
function generateDateSelector() {
    const scrollContainer = document.getElementById('dateSelector');
    scrollContainer.innerHTML = '';
    
    // We want 14 days starting from baseDate
    for (let i = 0; i < 14; i++) {
        const date = new Date(CONFIG.baseDate);
        date.setDate(date.getDate() + i);
        
        const yyyy = date.getUTCFullYear();
        const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(date.getUTCDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        
        // Setup initial default selected date (today)
        if (i === 0) {
            STATE.selectedDateStr = dateStr;
        }
        
        const card = document.createElement('div');
        card.className = `date-card ${i === 0 ? 'active' : ''}`;
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
    }
}

// --- INITIALIZE FILTERS & SWITCHERS ---
function initFilters() {
    // Search filter
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        STATE.searchQuery = e.target.value.trim().toLowerCase();
        renderShowtimes();
    });
    
    // Cinema Chain Chips
    const chips = document.querySelectorAll('#cinemaChips .chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            STATE.selectedChain = chip.getAttribute('data-chain');
            STATE.selectedCinema = 'all'; // Reset cinema sub-filter
            updateCinemaSubChips(); // Update sub-chips
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
        const response = await fetch(CONFIG.apiEndpoint);
        if (!response.ok) throw new Error('API fetch failed');
        STATE.allShowtimes = await response.json();
        updateCinemaSubChips(); // Initialize sub-chips
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
    const grid = document.getElementById('movieGrid');
    grid.className = 'movie-grid'; // Reset class
    grid.innerHTML = '';
    
    // 1. Filter by Date, Chain, Cinema, and Search
    const filtered = STATE.allShowtimes.filter(item => {
        if (item.date !== STATE.selectedDateStr) return false;
        
        if (STATE.selectedChain !== 'all') {
            const chainName = getChainFromCinema(item.cinema);
            if (chainName !== STATE.selectedChain) return false;
        }

        if (STATE.selectedCinema !== 'all') {
            if (item.cinema !== STATE.selectedCinema) return false;
        }
        
        if (STATE.searchQuery) {
            const titleMatch = item.movie.toLowerCase().includes(STATE.searchQuery);
            const cinemaMatch = item.cinema.toLowerCase().includes(STATE.searchQuery);
            if (!titleMatch && !cinemaMatch) return false;
        }
        
        return true;
    });
    
    // 2. Group by movie + cinema
    const grouped = {};
    filtered.forEach(session => {
        const key = `${session.movie}_${session.cinema}`;
        if (!grouped[key]) {
            grouped[key] = {
                movie: session.movie,
                cinema: session.cinema,
                format: session.format,
                language: session.language,
                booking_url: session.booking_url,
                image: session.image || getPosterFallbackUrl(session.movie),
                showtimes: []
            };
        }
        if (!grouped[key].showtimes.includes(session.time)) {
            grouped[key].showtimes.push(session.time);
        }
    });

    const cardDataArray = Object.values(grouped);
    
    if (cardDataArray.length === 0) {
        renderEmptyState(grid);
        return;
    }
    
    cardDataArray.sort((a, b) => a.movie.localeCompare(b.movie));
    
    cardDataArray.forEach(cardData => {
        const chainClass = getChainFromCinema(cardData.cinema);
        const cardElement = document.createElement('article');
        cardElement.className = 'movie-card';
        
        cardData.showtimes.sort();
        const showtimesHtml = cardData.showtimes.map(time => {
            if (cardData.booking_url) {
                return `<a href="${cardData.booking_url}" target="_blank" class="time-pill">${time}</a>`;
            } else {
                return `<span class="time-pill">${time}</span>`;
            }
        }).join('');

        const displayChain = getDisplayChain(chainClass);
        const displayCinema = cardData.cinema.replace('Cine Yelmo ', '').replace('mk2 Cinesur ', '');

        cardElement.innerHTML = `
            <div class="poster-container">
                <span class="chain-badge ${chainClass}">${displayChain}</span>
                <img class="movie-poster" src="${cardData.image}" alt="${cardData.movie} Poster" loading="lazy" onerror="this.src='data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27 width%3D%27200%27 height%3D%27300%27 viewBox%3D%270 0 200 300%27%3E%3Crect width%3D%27100%25%27 height%3D%27100%25%27 fill%3D%27%25231e293b%27%2F%3E%3Ctext x%3D%2750%25%27 y%3D%2750%25%27 dominant-baseline%3D%27middle%27 text-anchor%3D%27middle%27 fill%3D%27%252364748b%27 font-family%3D%27Outfit%27 font-size%3D%2714%27%3ENo Image%3C%2Ftext%3E%3C%2Fsvg%3E'">
            </div>
            <div class="card-content">
                <h2 class="movie-title">${cardData.movie}</h2>
                <div class="movie-meta">
                    <span>${displayCinema}</span>
                </div>
                <div class="movie-lang" title="${cardData.language}">${cardData.language}</div>
                <div class="showtimes-section">
                    <span class="showtimes-label">VOSE Showtimes:</span>
                    <div class="showtimes-list">
                        ${showtimesHtml}
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
    
    // 1. Filter by Chain, Cinema and Search Query (ALL DATES included)
    const filtered = STATE.allShowtimes.filter(item => {
        if (STATE.selectedChain !== 'all') {
            const chainName = getChainFromCinema(item.cinema);
            if (chainName !== STATE.selectedChain) return false;
        }

        if (STATE.selectedCinema !== 'all') {
            if (item.cinema !== STATE.selectedCinema) return false;
        }
        
        if (STATE.searchQuery) {
            const titleMatch = item.movie.toLowerCase().includes(STATE.searchQuery);
            const cinemaMatch = item.cinema.toLowerCase().includes(STATE.searchQuery);
            if (!titleMatch && !cinemaMatch) return false;
        }
        
        return true;
    });

    // 2. Group by Movie
    const moviesGrouped = {};
    filtered.forEach(session => {
        const movieTitle = session.movie;
        if (!moviesGrouped[movieTitle]) {
            moviesGrouped[movieTitle] = {
                title: movieTitle,
                image: session.image || getPosterFallbackUrl(movieTitle),
                language: session.language, // Keep language sample
                dates: {} // Grouped showtimes by date
            };
        }

        const dateStr = session.date;
        if (!moviesGrouped[movieTitle].dates[dateStr]) {
            moviesGrouped[movieTitle].dates[dateStr] = {}; // Grouped by cinema on this date
        }

        const cinemaName = session.cinema;
        if (!moviesGrouped[movieTitle].dates[dateStr][cinemaName]) {
            moviesGrouped[movieTitle].dates[dateStr][cinemaName] = {
                showtimes: [],
                booking_url: session.booking_url
            };
        }

        if (!moviesGrouped[movieTitle].dates[dateStr][cinemaName].showtimes.includes(session.time)) {
            moviesGrouped[movieTitle].dates[dateStr][cinemaName].showtimes.push(session.time);
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
                <div class="movie-lang" title="${movieData.language}">${movieData.language}</div>
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
function updateCinemaSubChips() {
    const container = document.getElementById('cinemaSubFilterGroup');
    const subChipsContainer = document.getElementById('cinemaSubChips');
    
    if (STATE.selectedChain === 'all') {
        container.style.display = 'none';
        return;
    }
    
    // Get unique cinemas for the selected chain from all showtimes
    const cinemas = [...new Set(STATE.allShowtimes
        .filter(item => getChainFromCinema(item.cinema) === STATE.selectedChain)
        .map(item => item.cinema)
    )].sort();
    
    // Hide sub-filters if there is 1 or fewer cinemas to choose from
    if (cinemas.length <= 1) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'flex';
    subChipsContainer.innerHTML = '';
    
    // Create the "All Locations" chip
    const allChip = document.createElement('button');
    allChip.className = `chip active-chain-${STATE.selectedChain} ${STATE.selectedCinema === 'all' ? 'active' : ''}`;
    allChip.textContent = `All ${getDisplayChain(STATE.selectedChain)} Locations`;
    
    allChip.addEventListener('click', () => {
        subChipsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        allChip.classList.add('active');
        STATE.selectedCinema = 'all';
        renderShowtimes();
    });
    subChipsContainer.appendChild(allChip);
    
    // Create specific location chips
    cinemas.forEach(cinemaName => {
        const chip = document.createElement('button');
        chip.className = `chip active-chain-${STATE.selectedChain} ${STATE.selectedCinema === cinemaName ? 'active' : ''}`;
        
        // Clean display name
        const displayCinema = cinemaName.replace('Cine Yelmo ', '').replace('mk2 Cinesur ', '');
        chip.textContent = displayCinema;
        
        chip.addEventListener('click', () => {
            subChipsContainer.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            STATE.selectedCinema = cinemaName;
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
    return 'Other';
}

function getChainFromCinema(cinemaName) {
    const name = cinemaName.toLowerCase();
    if (name.includes('yelmo')) return 'yelmo';
    if (name.includes('cinesur')) return 'cinesur';
    if (name.includes('albéniz') || name.includes('albeniz')) return 'albeniz';
    return 'other';
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
