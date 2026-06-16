import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import urllib3
import re

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def scrape_megarama():
    from scrape_and_compile import get_spain_timezone
    print("Scraping Megarama Granada...")
    sessions_list = []
    
    spain_tz = get_spain_timezone()
    now_local = datetime.now(spain_tz)
    
    # Scrape today and the next 7 days
    for i in range(8):
        date_obj = now_local + timedelta(days=i)
        date_str = date_obj.strftime("%Y-%m-%d")
        
        # Calculate cinematic week start (preceding Friday)
        friday = date_obj - timedelta(days=(date_obj.weekday() - 4) % 7)
        friday_str = friday.strftime("%Y-%m-%d")
        
        url = f"http://granada.megarama.es/ES/ajax/cine/megarama.horaires?semaineSel={friday_str}&jourSel={date_str}"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        try:
            response = requests.get(url, headers=headers, verify=False, timeout=15)
            if response.status_code != 200:
                continue
                
            soup = BeautifulSoup(response.text, "html.parser")
            movies = soup.select("div.horaireZoning")
            
            for movie in movies:
                title_el = movie.select_one("div.afficheTitre")
                title = title_el.text.strip() if title_el else "Unknown"
                
                # Clean movie title
                clean_title = re.sub(r'\s+', ' ', title).strip()
                
                sessions = movie.select("div.BTHoraire")
                for s in sessions:
                    parent = s.parent
                    parent_classes = parent.get("class", []) if parent else []
                    
                    ver_el = s.select_one("div.version")
                    version = ver_el.text.strip() if ver_el else ""
                    
                    # Check if session is VO/VOSE
                    is_vose = "VO" in parent_classes or "VOSE" in parent_classes or "VO" in version or "VOSE" in version
                    if not is_vose:
                        continue
                        
                    time_el = s.select_one("div.heure")
                    time_raw = time_el.text.strip() if time_el else ""
                    # Convert "19h45" to "19:45"
                    time_str = time_raw.replace("h", ":") if time_raw else ""
                    
                    link_el = s.select_one("a.Erakys_select_seance")
                    booking_url = link_el.get("href") if link_el else ""
                    
                    session_dict = {
                        "cinema": "Megarama Granada",
                        "date": date_str,
                        "movie": clean_title,
                        "format": "2D",
                        "language": "V.O.S.E.",
                        "original_language": "",  # to be filled by cross-referencing
                        "time": time_str,
                        "booking_url": booking_url,
                        "projection_type": "Movie",
                        "movie_title_language": "ES"
                    }
                    sessions_list.append(session_dict)
        except Exception as e:
            print(f"Error scraping Megarama for date {date_str}: {e}")
            
    print(f"Megarama Granada: Scraped {len(sessions_list)} sessions.")
    return sessions_list
