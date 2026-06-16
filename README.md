# VOSE Spain Screenings

A unified movie showtimes tracker for movies screening in original version with Spanish subtitles (VOSE) across Spain.

## How to Host the Project Locally

Since this is a static web application built using HTML, CSS, and Vanilla JavaScript, it does not require a complex build process. You just need a simple HTTP server to serve the files locally.

Here are the easiest ways to host the project locally:

### Option 1: Using Python (Recommended)

Python has a built-in HTTP server that requires no extra installation.

1. Open a terminal/command prompt in the project's root directory.
2. Run the following command:
   ```bash
   python -m http.server 8000
   ```
3. Open your browser and navigate to:
   [http://localhost:8000](http://localhost:8000)

*Note: If port `8000` is already in use by another application, you can specify a different port (e.g., `8001`):*
```bash
python -m http.server 8001
```

---

### Option 2: Using Node.js / npm

If you prefer Node.js, you can use any static server utility like `serve` or `http-server` via `npx` (which downloads and runs them on the fly).

**Using `serve`:**
```bash
npx serve .
```
Then navigate to: [http://localhost:3000](http://localhost:3000) (or the port shown in your terminal).

**Using `http-server`:**
```bash
npx http-server . -p 8000
```

---

## Technical Overview

- **Frontend**: The entry point is `index.html`. It references local styles in `css/styles.css` and JavaScript logic in `js/app.js`.
- **Data Source**: The application dynamically fetches showtime data from `api/v1/showtimes.json` and title translations from `movie_title_translations.json` to render the UI.
