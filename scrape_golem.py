import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import urllib3
import re

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def scrape_golem():
    from scrape_and_compile import get_spain_timezone
    
    print("Scraping Cines Golem...")
    sessions_list = []
    
    spain_tz = get_spain_timezone()
    now_local = datetime.now(spain_tz)
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    # Scrape today and next 7 days
    for i in range(8):
        date_obj = now_local + timedelta(days=i)
        
        # Today doesn't need a date suffix on the main Golem Madrid page
        if i == 0:
            url = "https://www.golem.es/golem/golem-madrid"
        else:
            date_suffix = date_obj.strftime("%Y%m%d")
            url = f"https://www.golem.es/golem/golem-madrid/{date_suffix}"
            
        date_str = date_obj.strftime("%Y-%m-%d")
        
        try:
            response = requests.get(url, headers=headers, verify=False, timeout=15)
            if response.status_code != 200:
                continue
                
            soup = BeautifulSoup(response.text, "html.parser")
            movie_links = soup.find_all("a", href=lambda h: h and h.startswith("/golem/pelicula/"))
            
            # De-duplicate movie links on the same page
            unique_links = []
            seen_hrefs = set()
            for link in movie_links:
                href = link.get("href")
                if href not in seen_hrefs:
                    seen_hrefs.add(href)
                    unique_links.append(link)
                    
            for link in unique_links:
                title = link.text.strip()
                if not title:
                    continue
                    
                # VOSE Filtering
                title_lower = title.lower()
                is_vose = "v.o.s." in title_lower or "vose" in title_lower or "v.o." in title_lower
                if not is_vose:
                    continue
                    
                # Clean title
                clean_title = re.sub(r'(?i)\(v\.o\.s\.e\.\)|\(v\.o\.s\.e\)|\(v\.o\.\)|\(v\.o\)|\(vose\)|\bVOSE\b', '', title).strip()
                clean_title = re.sub(r'\s+', ' ', clean_title).strip(" -")
                
                # Extract showtimes in the movie block (climbing up the DOM tree)
                sessions = []
                movie_td = link.find_parent("td")
                if movie_td:
                    ancestor = movie_td
                    for _ in range(5):
                        if not ancestor:
                            break
                        showtime_links = ancestor.find_all("a", href=lambda h: h and "/golem/urlcheck.php" in h)
                        if showtime_links:
                            for s_link in showtime_links:
                                time_str = s_link.text.strip()
                                # Verify format HH:MM
                                if re.match(r'^\d{2}:\d{2}$', time_str):
                                    booking_url = "https://www.golem.es" + s_link.get("href", "")
                                    sessions.append((time_str, booking_url))
                            if sessions:
                                break
                        ancestor = ancestor.parent
                        
                for time_val, booking_url in sessions:
                    session_dict = {
                        "cinema": "Cines Golem Madrid",
                        "date": date_str,
                        "movie": clean_title,
                        "format": "2D",
                        "language": "V.O.S.E.",
                        "original_language": "",  # to be filled by compiler cross-reference
                        "time": time_val,
                        "booking_url": booking_url,
                        "projection_type": "Movie",
                        "movie_title_language": "ES"
                    }
                    sessions_list.append(session_dict)
        except Exception as e:
            print(f"Error scraping Cines Golem Madrid for date {date_str}: {e}")
            
    print(f"Cines Golem Madrid: Scraped {len(sessions_list)} VOSE sessions.")
    return sessions_list
