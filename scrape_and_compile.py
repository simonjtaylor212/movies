import os
import re
import json
import requests
import unicodedata
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup
from scrape_kinepolis import scrape_kinepolis
from scrape_ocine import scrape_ocine
from scrape_renoir import scrape_renoir
from scrape_golem import scrape_golem
from scrape_cinesa import scrape_cinesa

def get_spain_timezone():
    try:
        from zoneinfo import ZoneInfo
        return ZoneInfo("Europe/Madrid")
    except Exception:
        # Fallback to UTC+2 for CEST (Spain summer time)
        return timezone(timedelta(hours=2))

def get_next_days(num_days):
    # Use Spain's local timezone since showtimes are in Spanish local time
    spain_tz = get_spain_timezone()
    now_local = datetime.now(spain_tz)
    base_date = datetime(now_local.year, now_local.month, now_local.day, tzinfo=spain_tz)
    return [base_date + timedelta(days=i) for i in range(num_days)]

def get_language_name(lang_str):
    if not lang_str:
        return ""
    lang_upper = lang_str.upper()
    if "INGL" in lang_upper:
        return "English"
    elif "ITAL" in lang_upper:
        return "Italian"
    elif "FRAN" in lang_upper:
        return "French"
    elif "ALEM" in lang_upper:
        return "German"
    elif "JAPO" in lang_upper:
        return "Japanese"
    elif "CORE" in lang_upper:
        return "Korean"
    elif "RUSO" in lang_upper:
        return "Russian"
    elif "CHIN" in lang_upper:
        return "Chinese"
    elif "PORT" in lang_upper:
        return "Portuguese"
    elif "CATAL" in lang_upper:
        return "Catalan"
    elif "NORU" in lang_upper:
        return "Norwegian"
    elif "ESPA" in lang_upper or "CAST" in lang_upper:
        return "Spanish"
    return ""

def normalize_title(t):
    if not t:
        return ""
    # Normalize unicode characters to decompose combined characters (like accented ones)
    s = unicodedata.normalize('NFD', t)
    # Filter out non-spacing mark characters (accents)
    s = "".join([c for c in s if not unicodedata.combining(c)])
    # Lowercase and remove all non-alphanumeric characters
    return re.sub(r'[^a-z0-9]', '', s.lower())

def scrape_yelmo():
    print("Scraping Cine Yelmo...")
    url = "https://www.yelmocines.es/now-playing.aspx/GetNowPlaying"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    sessions = []
    
    for city in ["malaga", "madrid", "barcelona"]:
        print(f"  Fetching Yelmo {city}...")
        payload = {"cityKey": city}
        
        try:
            response = requests.post(url, json=payload, headers=headers, timeout=15)
            if response.status_code != 200:
                print(f"Yelmo {city} returned status code {response.status_code}")
                continue
            data = response.json()
        except Exception as e:
            print(f"Error fetching Yelmo {city}: {e}")
            continue

        # Traverse: d -> Cinemas -> Dates -> Movies -> Formats -> Showtimes
        cinemas = data.get('d', {}).get('Cinemas', [])
        for cinema in cinemas:
            cinema_name = f"Cine Yelmo {cinema.get('Name', '').strip()}"
            for date_info in cinema.get('Dates', []):
                filter_date_str = date_info.get('FilterDate', '')
                # Parse dot net JSON date e.g. /Date(1781413200000)/
                match = re.search(r'/Date\((\d+)\)/', filter_date_str)
                if not match:
                    continue
                dt = datetime.fromtimestamp(int(match.group(1)) / 1000.0, timezone.utc)
                date_str = dt.strftime('%Y-%m-%d')
                
                for movie in date_info.get('Movies', []):
                    title = movie.get('Title', '').strip()
                    proj_type = movie.get('ProjectionType', 'Movie')
                    for fmt in movie.get('Formats', []):
                        lang = fmt.get('Language', '')
                        # Check for VOSE
                        if 'VOSE' in lang.upper() or 'SUBTITULAD' in lang.upper() or 'V.O.S.' in lang.upper():
                            fmt_name = fmt.get('Name', '2D')
                            for st in fmt.get('Showtimes', []):
                                time_str = st.get('Time', '')
                                # Yelmo booking URL pattern
                                showtime_id = st.get('ShowtimeId', '')
                                vista_cinema_id = st.get('VistaCinemaId', '')
                                booking_url = f"https://compra.yelmocines.es/?cinemaVistaId={vista_cinema_id}&showtimeVistaId={showtime_id}" if showtime_id else ""
                                
                                sessions.append({
                                    "cinema": cinema_name,
                                    "date": date_str,
                                    "movie": title,
                                    "format": fmt_name,
                                    "language": lang.strip(),
                                    "original_language": get_language_name(lang),
                                    "time": time_str,
                                    "booking_url": booking_url,
                                    "projection_type": proj_type,
                                    "movie_title_language": "ES"
                                })
    print(f"Yelmo scraped: found {len(sessions)} VOSE sessions.")
    return sessions

def scrape_albeniz():
    print("Scraping Cine Albéniz...")
    sessions = []
    days = get_next_days(30)
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    empty_days_count = 0
    for dt in days:
        if empty_days_count >= 5:
            print("Stopping Cine Albéniz scrape after 5 consecutive empty days.")
            break
            
        date_str = dt.strftime('%Y-%m-%d')
        url = f"https://cinealbeniz.com/cartelera/dia/{date_str}"
        try:
            response = requests.get(url, headers=headers, timeout=15)
            if response.status_code != 200:
                print(f"Albéniz returned status code {response.status_code} for {date_str}")
                empty_days_count += 1
                continue
            soup = BeautifulSoup(response.text, 'html.parser')
        except Exception as e:
            print(f"Error fetching Albéniz for {date_str}: {e}")
            empty_days_count += 1
            continue

        film_boxes = soup.find_all('div', class_='sH1')
        day_sessions_count = 0
        for film_box in film_boxes:
            title_div = film_box.find('div', class_='pelicula-info-titulo')
            if not title_div:
                continue
            title = title_div.get_text(strip=True)
            
            info_div = film_box.find('div', class_='pelicula-info-small')
            if info_div:
                info_text = info_div.get_text(separator="###").strip()
                # Check for VOSE
                if "V.O.S.E." in info_text:
                    parts = [p.strip() for p in info_text.split('###')]
                    # Expect structure: Room, Showtime hours, duration, language, genre
                    room = parts[0] if parts else "Sala Principal"
                    
                    showtimes_part = ""
                    lang_part = "Original | V.O.S.E."
                    for part in parts:
                        if "Sesión" in part or "Sesiones" in part:
                            showtimes_part = part.replace("Sesión hoy: ", "").replace("Sesiones hoy: ", "")
                        elif "V.O.S.E." in part:
                            lang_part = part
                    
                    # Split comma-separated showtimes (e.g. "18:10h, 20:30h")
                    times = [t.replace('h', '').strip() for t in showtimes_part.split(',')]
                    
                    booking_link_tag = film_box.find('a', class_='comprarEntradaLink')
                    booking_url = booking_link_tag.get('href', '') if booking_link_tag else ""
                    if booking_url and not booking_url.startswith('http'):
                        booking_url = f"https://cinealbeniz.com/{booking_url}"

                    # Clean language name for mapping, e.g. "Inglés | V.O.S.E." -> "Inglés"
                    lang_name = lang_part.split('|')[0].strip() if '|' in lang_part else lang_part
                    orig_lang = get_language_name(lang_name)

                    for time_val in times:
                        if time_val:
                            sessions.append({
                                "cinema": "Cine Albéniz",
                                "date": date_str,
                                "movie": title,
                                "format": "2D",
                                "language": lang_part,
                                "original_language": orig_lang,
                                "time": time_val,
                                "booking_url": booking_url,
                                "projection_type": "Movie",
                                "movie_title_language": "OR"
                            })
                            day_sessions_count += 1
                            
        if day_sessions_count == 0:
            empty_days_count += 1
        else:
            empty_days_count = 0

    print(f"Cine Albéniz scraped: found {len(sessions)} VOSE sessions.")
    return sessions

def parse_cinesur_date(day_text, base_date):
    day_text = day_text.strip().lower()
    if 'hoy' in day_text:
        return base_date
    elif 'mañana' in day_text or 'mañ' in day_text or 'maã±ana' in day_text:
        return base_date + timedelta(days=1)
    
    # Matches patterns like "16/06"
    match = re.search(r'(\d{2})/(\d{2})', day_text)
    if match:
        day = int(match.group(1))
        month = int(match.group(2))
        year = base_date.year
        if month < base_date.month:  # Rolling over to next year
            year += 1
        return datetime(year, month, day, tzinfo=timezone.utc)
    return None

def scrape_cinesur_theatre(cinema_slug, cinema_name, base_date, movie_langs):
    url = f"https://mk2cines.es/es/{cinema_slug}/vose"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"Cinesur {cinema_slug} returned status code {response.status_code}")
            return []
        soup = BeautifulSoup(response.text, 'html.parser')
    except Exception as e:
        print(f"Error fetching Cinesur {cinema_slug}: {e}")
        return []

    # Parse the day buttons first to map indices to dates
    day_buttons = soup.find_all(class_='cambiar-dia')
    date_mapping = {}
    for btn in day_buttons:
        data_num = btn.get('data-num')
        if data_num is not None:
            parsed_dt = parse_cinesur_date(btn.get_text(), base_date)
            if parsed_dt:
                date_mapping[int(data_num)] = parsed_dt.strftime('%Y-%m-%d')

    # Build a normalized title map for lookup
    norm_movie_langs = {normalize_title(k): v for k, v in movie_langs.items()}

    sessions = []
    # Loop over each day container (cines-0, cines-1, etc.)
    for idx, date_str in date_mapping.items():
        container = soup.find('div', class_=f'cines-{idx}')
        if not container:
            continue
        
        # Inside the container, loop over each movie box (class "peli")
        # In mk2 Cinesur, movie structure is a list of movie elements, with class "peli"
        # followed by a div with class "horas" containing the buttons
        peli_divs = container.find_all('div', class_='peli')
        for peli in peli_divs:
            title_tag = peli.find('p', class_='text-header-span')
            if not title_tag:
                continue
            title = title_tag.get_text(strip=True)
            
            # The next sibling contains the hours
            sibling = peli.find_next_sibling('div', class_='horas')
            if sibling:
                for btn in sibling.find_all('a', class_='btn-default'):
                    btn_text = btn.get_text(strip=True)
                    if "VOSE" in btn_text:
                        # Extract showtime, e.g. "VOSE18:00" -> "18:00"
                        time_str = btn_text.replace("VOSE", "").strip()
                        booking_url = btn.get('href', '')
                        
                        # Lookup original language
                        norm_title = normalize_title(title)
                        orig_lang = norm_movie_langs.get(norm_title, "")
                        
                        sessions.append({
                            "cinema": cinema_name,
                            "date": date_str,
                            "movie": title,
                            "format": "2D",
                            "language": "Original con subtítulos (VOSE)",
                            "original_language": orig_lang,
                            "time": time_str,
                            "booking_url": booking_url,
                            "projection_type": "Movie",
                            "movie_title_language": "ES"
                        })
    return sessions

def scrape_cinesur(movie_langs):
    print("Scraping mk2 Cinesur...")
    # Use Spain's local timezone since showtimes are in Spanish local time
    spain_tz = get_spain_timezone()
    now_local = datetime.now(spain_tz)
    base_date = datetime(now_local.year, now_local.month, now_local.day, tzinfo=spain_tz)
    theatres = [
        ("miramar-fuengirola", "mk2 Cinesur Miramar"),
        ("el-ingenio-velez-malaga", "mk2 Cinesur El Ingenio"),
        ("malaga-nostrum-malaga", "mk2 Cinesur Málaga Nostrum")
    ]
    
    all_sessions = []
    for slug, name in theatres:
        t_sessions = scrape_cinesur_theatre(slug, name, base_date, movie_langs)
        print(f"  {name}: found {len(t_sessions)} sessions.")
        all_sessions.extend(t_sessions)
        
    print(f"mk2 Cinesur scraped: found {len(all_sessions)} VOSE sessions.")
    return all_sessions

def run_scraper_with_fallback(scraper_func, chain_identifier, previous_showtimes, *args):
    data = []
    try:
        data = scraper_func(*args)
    except Exception as e:
        print(f"Error in {chain_identifier} scraper: {e}")

    if not data:
        print(f"Warning: {chain_identifier} scraper returned 0 showings. Using fallback data.")
        with open("SCRAPER_ALERT", "a", encoding="utf-8") as f:
            f.write(f"{chain_identifier}\n")

        for s in previous_showtimes:
            # Simple substring match against cinema names
            clow = s.get("cinema", "").lower()
            if chain_identifier == "yelmo" and "yelmo" in clow: data.append(s)
            elif chain_identifier == "albeniz" and ("albeniz" in clow or "albéniz" in clow): data.append(s)
            elif chain_identifier == "kinepolis" and ("kinepolis" in clow or "kinépolis" in clow): data.append(s)
            elif chain_identifier == "renoir" and "renoir" in clow: data.append(s)
            elif chain_identifier == "golem" and "golem" in clow: data.append(s)
            elif chain_identifier == "ocine" and "ocine" in clow: data.append(s)
            elif chain_identifier == "cinesur" and "cinesur" in clow: data.append(s)
            elif chain_identifier == "cinesa" and "cinesa" in clow: data.append(s)

        print(f"Recovered {len(data)} {chain_identifier} showings from previous run.")
    return data

def main():
    spain_tz = get_spain_timezone()
    now_local = datetime.now(spain_tz)
    print(f"Starting Scraper - Local time is {now_local.strftime('%Y-%m-%d %H:%M:%S %Z')}")
    
    # Clean up previous SCRAPER_ALERT file if it exists
    if os.path.exists("SCRAPER_ALERT"):
        try:
            os.remove("SCRAPER_ALERT")
        except Exception as e:
            print(f"Failed to clean up SCRAPER_ALERT: {e}")

    # Load previous showtimes for fallback in case of scraper failures
    previous_showtimes = []
    output_path = "api/v1/showtimes.json"
    if os.path.exists(output_path):
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                previous_showtimes = json.load(f)
        except Exception as e:
            print(f"Error loading previous showtimes for fallback: {e}")

    # 1. Fetch from all sources
    yelmo_data = run_scraper_with_fallback(scrape_yelmo, "yelmo", previous_showtimes)
    albeniz_data = run_scraper_with_fallback(scrape_albeniz, "albeniz", previous_showtimes)
    kinepolis_data = run_scraper_with_fallback(scrape_kinepolis, "kinepolis", previous_showtimes)
    renoir_data = run_scraper_with_fallback(scrape_renoir, "renoir", previous_showtimes)
    golem_data = run_scraper_with_fallback(scrape_golem, "golem", previous_showtimes)
    
    # Load Cinesa from cache if present (scraped during the first PT VPN step in CI)
    cinesa_temp_path = "cinesa_temp.json"
    cinesa_data = []
    if os.path.exists(cinesa_temp_path):
        try:
            with open(cinesa_temp_path, "r", encoding="utf-8") as f:
                cinesa_data = json.load(f)
            print(f"Loaded {len(cinesa_data)} Cinesa showtimes from cache.")
            os.remove(cinesa_temp_path)
        except Exception as e:
            print(f"Error loading Cinesa cache: {e}")
            cinesa_data = run_scraper_with_fallback(scrape_cinesa, "cinesa", previous_showtimes)
    else:
        cinesa_data = run_scraper_with_fallback(scrape_cinesa, "cinesa", previous_showtimes)
    
    # Build a title-to-language map from yelmo, albeniz, kinepolis, renoir, golem, cinesa
    movie_langs = {}
    for s in yelmo_data:
        lang = s.get("original_language", "")
        if lang:
            movie_langs[s["movie"]] = lang
    for s in albeniz_data:
        lang = s.get("original_language", "")
        if lang:
            movie_langs[s["movie"]] = lang
    for s in kinepolis_data:
        lang = s.get("original_language", "")
        if lang:
            movie_langs[s["movie"]] = lang
    for s in renoir_data:
        lang = s.get("original_language", "")
        if lang:
            movie_langs[s["movie"]] = lang
    for s in golem_data:
        lang = s.get("original_language", "")
        if lang:
            movie_langs[s["movie"]] = lang
    for s in cinesa_data:
        lang = s.get("original_language", "")
        if lang:
            movie_langs[s["movie"]] = lang
            
    # Normalize keys for lookup
    norm_movie_langs = {normalize_title(k): v for k, v in movie_langs.items()}
    
    ocine_data = run_scraper_with_fallback(scrape_ocine, "ocine", previous_showtimes, norm_movie_langs)
    cinesur_data = run_scraper_with_fallback(scrape_cinesur, "cinesur", previous_showtimes, movie_langs)
    
    # 2. Combine
    all_showtimes = yelmo_data + albeniz_data + cinesur_data + kinepolis_data + ocine_data + renoir_data + golem_data + cinesa_data
    
    # Guess original_language for movies that don't have it, based on other showings
    # Build a map from movies that DO have it
    global_movie_langs = {}
    for s in all_showtimes:
        lang = s.get("original_language")
        if not lang:
            # Try to extract it from the local language string if it's missing
            lang = get_language_name(s.get("language", ""))
            if lang:
                s["original_language"] = lang

        if lang:
            norm_title = normalize_title(s["movie"])
            if norm_title not in global_movie_langs:
                global_movie_langs[norm_title] = lang

    # Fill in missing languages
    for s in all_showtimes:
        if not s.get("original_language"):
            norm_title = normalize_title(s["movie"])
            if norm_title in global_movie_langs:
                s["original_language"] = global_movie_langs[norm_title]
            else:
                # Final attempt: try to parse from the language field itself if not already done
                s["original_language"] = get_language_name(s.get("language", ""))

    # Log missing original languages
    missing_by_chain = {}
    for s in all_showtimes:
        if not s.get("original_language"):
            cinema = s.get("cinema", "Other")
            clow = cinema.lower()
            if "yelmo" in clow: chain = "Yelmo"
            elif "cinesa" in clow: chain = "Cinesa"
            elif "cinesur" in clow: chain = "Cinesur"
            elif "albeniz" in clow or "albéniz" in clow: chain = "Albéniz"
            elif "kinepolis" in clow or "kinépolis" in clow: chain = "Kinépolis"
            elif "ocine" in clow: chain = "Ocine"
            elif "renoir" in clow: chain = "Renoir"
            elif "golem" in clow: chain = "Golem"
            else: chain = "Other"

            if chain not in missing_by_chain:
                missing_by_chain[chain] = set()
            missing_by_chain[chain].add(normalize_title(s["movie"]))

    for chain, movies in sorted(missing_by_chain.items()):
        print(f"original language not found for {len(movies)} movies in {chain} chain")

    # 3. Filter out past showtimes (only keep today and future showtimes)
    today_str = now_local.strftime('%Y-%m-%d')
    filtered_showtimes = [s for s in all_showtimes if s['date'] >= today_str]
    
    # 4. Update movie title translations
    translations_path = "movie_title_translations.json"
    translations = {}
    if os.path.exists(translations_path):
        try:
            with open(translations_path, "r", encoding="utf-8") as f:
                translations = json.load(f)
        except Exception as e:
            print(f"Error reading {translations_path}: {e}")
            translations = {}
            
    # Normalize existing translation keys for lookup
    norm_translations = {normalize_title(k): k for k in translations.keys()}

    updated = False
    for s in all_showtimes:
        if s.get("movie_title_language") != "OR":
            movie_title = s.get("movie")
            if not movie_title:
                continue

            norm_title = normalize_title(movie_title)

            # 1. Check if we already have this title or a normalized version of it
            if movie_title in translations:
                continue

            if norm_title in norm_translations:
                # Use the existing canonical title instead of creating a near-duplicate
                canonical_title = norm_translations[norm_title]
                s["movie"] = canonical_title
                continue

            # 2. Truly new movie title
            translations[movie_title] = ""
            norm_translations[norm_title] = movie_title
            updated = True
                
    if updated or not os.path.exists(translations_path):
        # Sort keys for clean git diffs
        sorted_translations = dict(sorted(translations.items()))
        try:
            with open(translations_path, "w", encoding="utf-8") as f:
                json.dump(sorted_translations, f, ensure_ascii=False, indent=2)
            print(f"Updated {translations_path}")
        except Exception as e:
            print(f"Error writing to {translations_path}: {e}")
            
    # 5. Create directory structure
    os.makedirs("api/v1/showtimes", exist_ok=True)
    
    # 6. Save output with date_added timestamps
    output_path = "api/v1/showtimes.json"
    new_showtimes_path = "new_showtimes.json"
    
    # Load existing showtimes to preserve their date_added timestamps
    existing_showtimes_map = {}
    if os.path.exists(output_path):
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                for s in existing_data:
                    key = (s.get("cinema"), s.get("movie"), s.get("date"), s.get("time"))
                    # Map the key to the showing so we can retrieve its date_added timestamp
                    existing_showtimes_map[key] = s
        except Exception as e:
            print(f"Error reading {output_path}: {e}")
            
    new_showings = []
    added_time = now_local.strftime('%Y-%m-%d %H:%M:%S')
    
    # Process filtered_showtimes to check for new ones and assign/preserve timestamps
    for s in filtered_showtimes:
        key = (s.get("cinema"), s.get("movie"), s.get("date"), s.get("time"))
        if key in existing_showtimes_map:
            # Preserve original date_added timestamp
            existing_s = existing_showtimes_map[key]
            s["date_added"] = existing_s.get("date_added", added_time)
        else:
            # New showing found
            s["date_added"] = added_time
            new_showings.append(s)
            # Add to map in case of duplicates within the same run
            existing_showtimes_map[key] = s

    # Save current active showtimes to api/v1/showtimes.json
    try:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(filtered_showtimes, f, ensure_ascii=False, indent=2)
        print(f"Successfully generated {output_path} with {len(filtered_showtimes)} listings.")
    except Exception as e:
        print(f"Error writing to {output_path}: {e}")
        
    # Append new showings to new_showtimes.json
    if new_showings:
        new_showings_list = []
        if os.path.exists(new_showtimes_path):
            try:
                with open(new_showtimes_path, "r", encoding="utf-8") as f:
                    new_showings_list = json.load(f)
            except Exception as e:
                print(f"Error reading {new_showtimes_path}: {e}")
                
        new_showings_list.extend(new_showings)
        try:
            with open(new_showtimes_path, "w", encoding="utf-8") as f:
                json.dump(new_showings_list, f, ensure_ascii=False, indent=2)
            print(f"Appended {len(new_showings)} new showings to {new_showtimes_path}")
        except Exception as e:
            print(f"Error writing to {new_showtimes_path}: {e}")
    else:
        print("No new showings found.")

    # Resolve missing movie title translations
    print("\nResolving missing movie title translations...")
    try:
        import find_original_names
        find_original_names.main()
    except Exception as e:
        print(f"Error resolving translations: {e}")

if __name__ == '__main__':
    main()
