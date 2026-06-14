-- 1. Cinemas Table
CREATE TABLE IF NOT EXISTS cinemas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    chain TEXT NOT NULL,       -- e.g., 'Yelmo', 'Cinesur', 'Albéniz', 'Cinesa'
    city TEXT NOT NULL,        -- e.g., 'Málaga', 'Fuengirola'
    address TEXT,
    UNIQUE(name, chain)
);

-- 2. Movies Table
CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    original_title TEXT,
    runtime_mins INTEGER,
    poster_url TEXT,
    synopsis TEXT,
    UNIQUE(title)
);

-- 3. Showtimes Table
CREATE TABLE IF NOT EXISTS showtimes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cinema_id INTEGER NOT NULL,
    movie_id INTEGER NOT NULL,
    showtime DATETIME NOT NULL,  -- Format: 'YYYY-MM-DD HH:MM:SS'
    room TEXT,                   -- e.g., 'Sala 10', 'Sala 2'
    format TEXT DEFAULT '2D',    -- e.g., '2D', '3D', 'ATMOS'
    language TEXT NOT NULL,      -- e.g., 'INGLÉS SUBTITULADO EN ESPAÑOL (VOSE)'
    booking_url TEXT,
    FOREIGN KEY (cinema_id) REFERENCES cinemas(id) ON DELETE CASCADE,
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE CASCADE,
    UNIQUE(cinema_id, movie_id, showtime, room)  -- Avoid duplicating the exact same screening
);

-- 4. Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_showtimes_date ON showtimes(showtime);
CREATE INDEX IF NOT EXISTS idx_showtimes_lang ON showtimes(language);
CREATE INDEX IF NOT EXISTS idx_cinemas_chain ON cinemas(chain);
