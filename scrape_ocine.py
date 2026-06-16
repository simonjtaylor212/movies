import requests
import json
import re
from datetime import datetime

def scrape_ocine(movie_langs=None):
    from scrape_and_compile import get_spain_timezone, normalize_title
    if movie_langs is None:
        movie_langs = {}
        
    print("Scraping Ocine Serrallo...")
    sessions_list = []
    
    url = "https://ocineserrallo.es/components/com_cines/json/es_cartellera.json"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"Error fetching Ocine: status {response.status_code}")
            return []
            
        data = response.json()
        vose_movies = data.get("vose", [])
        
        spain_tz = get_spain_timezone()
        today_local = datetime.now(spain_tz).date()
        
        for movie in vose_movies:
            title = movie.get("peli_titol", "")
            # Clean title
            clean_title = re.sub(r'(?i)\(vose\)|\bVOSE\b|\(atmos\)|\batmos\b', '', title).strip()
            clean_title = re.sub(r'\s+', ' ', clean_title).strip(" -")
            
            plans = movie.get("Planificacions", [])
            peli_id = movie.get("peli_pelicula")
            
            for plan in plans:
                plan_id = plan.get("plan_planificacio")
                sala_id = plan.get("plan_sala")
                date_val = plan.get("plan_data")
                time_raw = plan.get("plan_horainici")
                time_val = time_raw[:5] if time_raw else ""
                
                if not date_val:
                    continue
                    
                # Skip past showtimes
                try:
                    session_date = datetime.strptime(date_val, "%Y-%m-%d").date()
                    if session_date < today_local:
                        continue
                except Exception:
                    pass
                
                # Booking URL
                is_numerada = plan.get("plan_numerada") == "S"
                show_file = "show_numerada_confirmation.php" if is_numerada else "show_confirmation.php"
                booking_url = f"https://tickets.ocineserrallo.es/compra/{show_file}?peli={peli_id}&plan={plan_id}&sala={sala_id}&URLinici=https%3A%2F%2Focineserrallo.es%2F%3Ftask%3Dcartelera"
                
                # Map original language
                norm_title = normalize_title(clean_title)
                original_lang = movie_langs.get(norm_title, "")
                
                session_dict = {
                    "cinema": "Ocine Serrallo",
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
        print(f"Error scraping Ocine Serrallo: {e}")
        
    print(f"Ocine Serrallo: Scraped {len(sessions_list)} sessions.")
    return sessions_list
