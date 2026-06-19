import requests
from bs4 import BeautifulSoup
from datetime import datetime, timedelta
import urllib3
import re

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

def scrape_renoir():
    from scrape_and_compile import get_spain_timezone, get_language_name
    
    print("Scraping Cines Renoir...")
    sessions_list = []
    
    spain_tz = get_spain_timezone()
    now_local = datetime.now(spain_tz)
    
    # Slugs and display names
    theatres = [
        ("renoir-plaza-de-espana", "Cines Renoir Plaza de España"),
        ("cines-princesa", "Cines Renoir Princesa"),
        ("renoir-retiro", "Cines Renoir Retiro"),
        ("renoir-floridablanca", "Cines Renoir Floridablanca")
    ]
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    # Cache to store language mapping for movies (movie_href -> mapped language name)
    movie_languages = {}
    
    # Scrape today and next 9 days (10 days total)
    for i in range(10):
        date_obj = now_local + timedelta(days=i)
        date_str = date_obj.strftime("%Y-%m-%d")
        
        for slug, cinema_name in theatres:
            url = f"https://www.cinesrenoir.com/cine/{slug}/cartelera/?fecha={date_str}"
            try:
                response = requests.get(url, headers=headers, verify=False, timeout=15)
                if response.status_code != 200:
                    continue
                    
                soup = BeautifulSoup(response.text, "html.parser")
                # Look at the visible containers on large screens
                movie_blocks = soup.select("div.my-account-content.d-none.d-lg-block")
                
                for block in movie_blocks:
                    title_el = block.select_one("a[href^='/pelicula/']")
                    if not title_el:
                        continue
                    title = title_el.text.strip()
                    
                    # Extract version details
                    col_4 = block.select_one("div.col-4")
                    version_text = ""
                    if col_4:
                        small_tags = col_4.find_all("small")
                        for small in small_tags:
                            text = small.text.strip()
                            if "original" in text.lower() or "v.o." in text.lower():
                                version_text = text
                                break
                    
                    # VOSE Filtering
                    is_vose = False
                    version_lower = version_text.lower()
                    if "subtitulada" in version_lower or "v.o.s.e" in version_lower or "vose" in version_lower:
                        is_vose = True
                    elif "original" in version_lower and "castellano" not in version_lower and "español" not in version_lower:
                        # Original version other than Spanish/Castilian
                        is_vose = True
                        
                    if not is_vose:
                        continue
                        
                    # Clean title
                    clean_title = re.sub(r'(?i)\(vose\)|\bVOSE\b', '', title).strip()
                    clean_title = re.sub(r'\s+', ' ', clean_title).strip(" -")
                    
                    # Fetch original language from the movie page if not cached
                    movie_href = title_el.get("href", "")
                    original_lang = ""
                    if movie_href:
                        if movie_href not in movie_languages:
                            movie_languages[movie_href] = ""
                            try:
                                movie_url = f"https://www.cinesrenoir.com{movie_href}"
                                movie_resp = requests.get(movie_url, headers=headers, verify=False, timeout=10)
                                if movie_resp.status_code == 200:
                                    movie_resp.encoding = 'utf-8'
                                    movie_soup = BeautifulSoup(movie_resp.text, "html.parser")
                                    # find <p class="detalle-label">Idioma original</p>
                                    label_el = movie_soup.find(class_="detalle-label", string=lambda s: s and "Idioma original" in s)
                                    if not label_el:
                                        label_el = movie_soup.find(class_="detalle-label", text=lambda t: t and "Idioma original" in t)
                                    if label_el:
                                        sibling_el = label_el.find_next_sibling("p")
                                        if sibling_el:
                                            raw_lang = sibling_el.text.strip()
                                            movie_languages[movie_href] = get_language_name(raw_lang)
                            except Exception as ex:
                                print(f"Error fetching movie page {movie_href}: {ex}")
                        original_lang = movie_languages[movie_href]
                    
                    # Get showtimes
                    pases = block.select("div.pase-cartelera")
                    for pase in pases:
                        btn = pase.select_one("a.btn-primary")
                        if btn:
                            time_str = btn.text.strip()
                            booking_url = btn.get("href", "")
                            
                            session_dict = {
                                "cinema": cinema_name,
                                "date": date_str,
                                "movie": clean_title,
                                "format": "2D",
                                "language": "V.O.S.E.",
                                "original_language": original_lang,
                                "time": time_str,
                                "booking_url": booking_url,
                                "projection_type": "Movie",
                                "movie_title_language": "ES"
                            }
                            sessions_list.append(session_dict)
            except Exception as e:
                print(f"Error scraping Cines Renoir {cinema_name} for date {date_str}: {e}")
                
    print(f"Cines Renoir: Scraped {len(sessions_list)} VOSE sessions.")
    return sessions_list
