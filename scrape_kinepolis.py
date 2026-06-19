import json
import re
import os
from playwright.sync_api import sync_playwright
from datetime import datetime, timezone, timedelta

def scrape_kinepolis():
    from scrape_and_compile import get_spain_timezone
    print("Scraping Kinépolis Granada & Nevada...")
    sessions_list = []
    
    # We allow running headless on environments that support it, but default to headed (headless=False)
    # because headed mode bypasses Akamai's bot detection. In CI, we run under xvfb-run.
    headless_env = os.environ.get("KINEPOLIS_HEADLESS", "false").lower() == "true"
    
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=headless_env,
                args=["--disable-blink-features=AutomationControlled"]
            )
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720}
            )
            # Hide webdriver property
            context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            page = context.new_page()
            
            # Navigate to Kinépolis Granada page
            url = "https://kinepolis.es/cines/kinepolis-granada"
            page.goto(url, timeout=45000)
            page.wait_for_timeout(5000)
            
            html = page.content()
            browser.close()
    except Exception as e:
        print(f"Error executing Playwright for Kinépolis: {e}")
        return []
        
    # Find the large Drupal.settings script tag
    script_tags = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
    json_str = None
    for content in script_tags:
        if "Drupal.settings" in content and len(content) > 50000:
            start_idx = content.find('{')
            end_idx = content.rfind('}')
            json_str = content[start_idx:end_idx+1]
            break
            
    if not json_str:
        print("Error: Could not find Drupal.settings block in Kinépolis HTML")
        return []
        
    try:
        data = json.loads(json_str)
        variables = data.get("variables", {})
        spain_tz = get_spain_timezone()
        today_local = datetime.now(spain_tz).date()
        
        # Parse both current and future movies
        for category in ["current_movies", "future_movies"]:
            movie_data = variables.get(category, {})
            films = movie_data.get("films", [])
            sessions = movie_data.get("sessions", [])
            
            films_map = {f["id"]: f for f in films}
            
            for s in sessions:
                complex_code = s.get("complexOperator")
                if complex_code not in ["KGRAN", "KNEVA", "KMAD", "KALCO"]:
                    continue
                    
                if complex_code == "KGRAN":
                    cinema_name = "Kinépolis Granada"
                elif complex_code == "KNEVA":
                    cinema_name = "Kinépolis Granada Nevada"
                elif complex_code == "KMAD":
                    cinema_name = "Kinépolis Madrid Ciudad de la Imagen"
                elif complex_code == "KALCO":
                    cinema_name = "Kinépolis Madrid Diversia"
                
                # Match film info
                film_info = s.get("film", {})
                film_id = film_info.get("id")
                film = films_map.get(film_id)
                if not film:
                    continue
                    
                title = film.get("title", "")
                subtitles = film.get("subtitles", [])
                
                # Safely get spokenLanguage details as it can be a dict, a list, or missing
                spoken_lang_data = film.get("spokenLanguage")
                if isinstance(spoken_lang_data, list):
                    spoken_lang_dict = spoken_lang_data[0] if len(spoken_lang_data) > 0 else {}
                elif isinstance(spoken_lang_data, dict):
                    spoken_lang_dict = spoken_lang_data
                else:
                    spoken_lang_dict = {}
                
                is_vose = False
                # Title contains VOSE/VOS
                if "vose" in title.lower() or "v.o.s." in title.lower():
                    is_vose = True
                # Subtitles include Spanish subtitles and audio is not Spanish
                elif any(sub.get("code") == "Span Subt" or sub.get("id") == "20" for sub in subtitles):
                    spoken_lang = spoken_lang_dict.get("code", "").lower()
                    if spoken_lang != "spanish":
                        is_vose = True
                        
                if not is_vose:
                    continue
                    
                # Extract date and time
                showtime_str = s.get("showtime")
                if not showtime_str:
                    continue
                    
                try:
                    cleaned_str = showtime_str.replace("+00:00", "").replace("Z", "")
                    dt_utc = datetime.fromisoformat(cleaned_str).replace(tzinfo=timezone.utc)
                    dt_local = dt_utc.astimezone(spain_tz)
                    
                    date_val = dt_local.strftime("%Y-%m-%d")
                    time_val = dt_local.strftime("%H:%M")
                except Exception:
                    continue
                    
                # Skip past sessions
                if dt_local.date() < today_local:
                    continue
                    
                # Map original language
                lang_str = spoken_lang_dict.get("name", "")
                original_lang = ""
                lang_upper = lang_str.upper()
                if "INGL" in lang_upper:
                    original_lang = "English"
                elif "ITAL" in lang_upper:
                    original_lang = "Italian"
                elif "FRAN" in lang_upper:
                    original_lang = "French"
                elif "ALEM" in lang_upper:
                    original_lang = "German"
                elif "JAPO" in lang_upper:
                    original_lang = "Japanese"
                elif "CORE" in lang_upper:
                    original_lang = "Korean"
                elif "RUSO" in lang_upper:
                    original_lang = "Russian"
                elif "CHIN" in lang_upper:
                    original_lang = "Chinese"
                elif "PORT" in lang_upper:
                    original_lang = "Portuguese"
                elif "CATAL" in lang_upper:
                    original_lang = "Catalan"
                elif "ESPA" in lang_upper or "CAST" in lang_upper:
                    original_lang = "Spanish"
                
                # Direct booking URL
                session_id = s.get("vistaSessionId")
                booking_url = f"https://kinepolis.es/direct-vista-redirect/{session_id}/0/{complex_code}/0"
                
                # Clean title
                clean_title = re.sub(r'(?i)\bVOSE\b|\bV\.O\.S\.E\.\b', '', title).strip()
                clean_title = re.sub(r'\s+', ' ', clean_title).strip(" -")
                
                session_dict = {
                    "cinema": cinema_name,
                    "date": date_val,
                    "movie": clean_title,
                    "format": "2D",
                    "language": "V.O.S.E.",
                    "original_language": original_lang,
                    "time": time_val,
                    "booking_url": booking_url,
                    "projection_type": "Movie",
                    "movie_title_language": "ES"
                }
                sessions_list.append(session_dict)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error parsing Kinépolis sessions: {e}")
        
    # Deduplicate sessions
    unique_sessions = []
    seen = set()
    for s in sessions_list:
        key = (s["cinema"], s["movie"], s["date"], s["time"])
        if key not in seen:
            seen.add(key)
            unique_sessions.append(s)
            
    print(f"Kinépolis Granada & Nevada: Scraped {len(unique_sessions)} VOSE sessions.")
    return unique_sessions
