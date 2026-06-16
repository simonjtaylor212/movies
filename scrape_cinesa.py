import requests
from bs4 import BeautifulSoup
import re
import json
from datetime import datetime

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

MADRID_CINEMAS = {
    "001": "Cinesa LUXE Loranca",
    "005": "Cinesa Parquesur",
    "015": "Cinesa Las Rosas",
    "018": "Cinesa Proyecciones",
    "019": "Cinesa LUXE Intu Xanadú",
    "025": "Cinesa LUXE La Moraleja",
    "026": "Cinesa LUXE Equinoccio",
    "027": "Cinesa Príncipe Pío",
    "034": "Cinesa Las Rozas",
    "048": "Cinesa La Gavia",
    "123": "Cinesa Méndez Álvaro",
    "124": "Cinesa Manoteras",
    "125": "Cinesa Nassica",
    "138": "Cinesa LUXE Oasiz"
}

def get_token():
    url = "https://www.cinesa.es/"
    try:
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code != 200:
            print(f"Error: Cinesa home returned status {r.status_code}")
            return None
        soup = BeautifulSoup(r.text, "html.parser")
        for script in soup.find_all("script"):
            content = script.string or ""
            if "initialData" in content:
                match = re.search(r'initialData\s*=\s*(\{.*?\});', content, re.DOTALL)
                if not match:
                    match = re.search(r'initialData\s*=\s*(\{.*\})', content, re.DOTALL)
                if match:
                    data = json.loads(match.group(1))
                    return data.get('api', {}).get('authToken')
    except Exception as e:
        print(f"Error fetching Cinesa auth token: {e}")
    return None

def scrape_cinesa():
    print("Scraping Cinesa Madrid...")
    token = get_token()
    if not token:
        print("Error: Could not retrieve Cinesa authentication token.")
        return []
        
    sites_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Authorization": f"Bearer {token}",
        "Origin": "https://www.cinesa.es",
        "Referer": "https://www.cinesa.es/"
    }
    
    site_ids = list(MADRID_CINEMAS.keys())
    site_ids_query = "&".join([f"siteIds={sid}" for sid in site_ids])
    
    # 1. Fetch available business dates
    dates_url = f"https://vwc.cinesa.es/WSVistaWebClient/ocapi/v1/film-screening-dates?{site_ids_query}"
    try:
        r = requests.get(dates_url, headers=sites_headers, timeout=15)
        if r.status_code != 200:
            print(f"Error: Fetching screening dates returned status {r.status_code}")
            return []
        dates_data = r.json()
    except Exception as e:
        print(f"Error fetching Cinesa dates: {e}")
        return []
        
    screening_dates = dates_data.get("filmScreeningDates", [])
    dates = [item.get("businessDate") for item in screening_dates if item.get("businessDate")]
    dates = sorted(list(set(dates)))
    print(f"Cinesa: Found {len(dates)} business dates with showtimes: {dates}")
    
    sessions_list = []
    
    # 2. Query showtimes for each business date
    for date_str in dates:
        showtimes_url = f"https://vwc.cinesa.es/WSVistaWebClient/ocapi/v1/showtimes/by-business-date/{date_str}?{site_ids_query}"
        try:
            r = requests.get(showtimes_url, headers=sites_headers, timeout=15)
            if r.status_code != 200:
                print(f"Error: Fetching showtimes for {date_str} returned status {r.status_code}")
                continue
            data = r.json()
        except Exception as e:
            print(f"Error fetching Cinesa showtimes for {date_str}: {e}")
            continue
            
        showtimes = data.get("showtimes", [])
        related_data = data.get("relatedData", {})
        
        # Build film map: filmId -> title
        films_map = {}
        for film in related_data.get("films", []):
            film_id = film.get("id")
            title_text = film.get("title", {}).get("text", "")
            if film_id and title_text:
                films_map[film_id] = title_text
                
        # Build attribute mappings: find VOSE attribute IDs and format mappings
        vose_attr_ids = set()
        format_map = {}
        attr_list = related_data.get("showtimeAttributes", []) or related_data.get("attributes", [])
        for attr in attr_list:
            attr_id = attr.get("id")
            if not attr_id:
                continue
            name = attr.get("name", {}).get("text", "").upper()
            short = attr.get("shortName", {}).get("text", "").upper()
            desc = attr.get("description", {}).get("text", "").upper()
            
            # Check for VOSE
            if "VOSE" in name or "VOSE" in short or "VOSE" in desc:
                vose_attr_ids.add(attr_id)
            elif "SUBTITULADA" in name or "SUBTITULADA" in desc:
                if "V.O." in name or "V.O." in short or "V.O." in desc or "ORIGINAL" in desc:
                    vose_attr_ids.add(attr_id)
                    
            # Map special formats
            if "IMAX" in name or "IMAX" in short:
                format_map[attr_id] = "IMAX"
            elif "SCREENX" in name or "SCREENX" in short:
                format_map[attr_id] = "ScreenX"
            elif "4DX" in name or "4DX" in short:
                format_map[attr_id] = "4DX"
            elif "ISENSE" in name or "ISENSE" in short:
                format_map[attr_id] = "ISENSE"
            elif "DOLBY ATMOS" in name or "ATMOS" in short:
                format_map[attr_id] = "ATMOS"
            elif "3D" in name or "3D" in short:
                format_map[attr_id] = "3D"
                
        # Process each showtime
        for st in showtimes:
            st_attr_ids = st.get("attributeIds", [])
            is_vose = any(aid in vose_attr_ids for aid in st_attr_ids)
            if not is_vose:
                continue
                
            film_id = st.get("filmId")
            movie_title = films_map.get(film_id, "Unknown Movie")
            
            site_id = st.get("siteId")
            cinema_name = MADRID_CINEMAS.get(site_id, "Cinesa")
            
            # Map format
            fmt = "2D"
            for aid in st_attr_ids:
                if aid in format_map:
                    fmt = format_map[aid]
                    break
                    
            # Extract date & time
            starts_at = st.get("schedule", {}).get("startsAt", "")
            if not starts_at:
                continue
                
            try:
                dt = datetime.fromisoformat(starts_at)
                st_date_str = dt.strftime("%Y-%m-%d")
                st_time_str = dt.strftime("%H:%M")
            except Exception:
                st_date_str = st.get("schedule", {}).get("businessDate", date_str)
                st_time_str = starts_at[11:16] if len(starts_at) > 16 else ""
                
            st_id = st.get("id")
            booking_url = f"https://www.cinesa.es/compra/butacas/?showtimeId={st_id}"
            
            # Clean movie title
            clean_title = re.sub(r'(?i)\(vose\)|\bVOSE\b|\bV\.O\.S\.E\.\b|\(v\.o\.s\.e\.\)|\(v\.o\.s\.e\)', '', movie_title).strip()
            clean_title = re.sub(r'\s+', ' ', clean_title).strip(" -")
            
            sessions_list.append({
                "cinema": cinema_name,
                "date": st_date_str,
                "movie": clean_title,
                "format": fmt,
                "language": "V.O.S.E.",
                "original_language": "",  # to be filled by cross-reference
                "time": st_time_str,
                "booking_url": booking_url,
                "projection_type": "Movie",
                "movie_title_language": "ES"
            })
            
    # Deduplicate sessions
    unique_sessions = []
    seen = set()
    for s in sessions_list:
        key = (s["cinema"], s["movie"], s["date"], s["time"])
        if key not in seen:
            seen.add(key)
            unique_sessions.append(s)
            
    print(f"Cinesa Madrid: Scraped {len(unique_sessions)} VOSE sessions.")
    return unique_sessions

if __name__ == "__main__":
    sessions = scrape_cinesa()
    for s in sessions[:5]:
        print(s)
