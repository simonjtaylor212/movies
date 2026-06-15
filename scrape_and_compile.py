import os
import re
import json
import requests
from datetime import datetime, timezone, timedelta
from bs4 import BeautifulSoup

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

def scrape_yelmo():
    print("Scraping Cine Yelmo...")
    url = "https://www.yelmocines.es/now-playing.aspx/GetNowPlaying"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    payload = {"cityKey": "malaga"}
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"Yelmo returned status code {response.status_code}")
            return []
        data = response.json()
    except Exception as e:
        print(f"Error fetching Yelmo: {e}")
        return []

    sessions = []
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
                                "time": time_str,
                                "booking_url": booking_url,
                                "projection_type": proj_type
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
                info_text = info_div.get_text(separator="|").strip()
                # Check for VOSE
                if "V.O.S.E." in info_text:
                    parts = [p.strip() for p in info_text.split('|')]
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

                    for time_val in times:
                        if time_val:
                            sessions.append({
                                "cinema": "Cine Albéniz",
                                "date": date_str,
                                "movie": title,
                                "format": "2D",
                                "language": lang_part,
                                "time": time_val,
                                "booking_url": booking_url,
                                "projection_type": "Movie"
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

def scrape_cinesur_theatre(cinema_slug, cinema_name, base_date):
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
                        
                        sessions.append({
                            "cinema": cinema_name,
                            "date": date_str,
                            "movie": title,
                            "format": "2D",
                            "language": "Original con subtítulos (VOSE)",
                            "time": time_str,
                            "booking_url": booking_url,
                            "projection_type": "Movie"
                        })
    return sessions

def scrape_cinesur():
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
        t_sessions = scrape_cinesur_theatre(slug, name, base_date)
        print(f"  {name}: found {len(t_sessions)} sessions.")
        all_sessions.extend(t_sessions)
        
    print(f"mk2 Cinesur scraped: found {len(all_sessions)} VOSE sessions.")
    return all_sessions

def main():
    spain_tz = get_spain_timezone()
    now_local = datetime.now(spain_tz)
    print(f"Starting Scraper - Local time is {now_local.strftime('%Y-%m-%d %H:%M:%S %Z')}")
    
    # 1. Fetch from all sources
    yelmo_data = scrape_yelmo()
    albeniz_data = scrape_albeniz()
    cinesur_data = scrape_cinesur()
    
    # 2. Combine
    all_showtimes = yelmo_data + albeniz_data + cinesur_data
    
    # 3. Filter out past showtimes (only keep today and future showtimes)
    today_str = now_local.strftime('%Y-%m-%d')
    filtered_showtimes = [s for s in all_showtimes if s['date'] >= today_str]
    
    # 4. Create directory structure
    os.makedirs("api/v1/showtimes", exist_ok=True)
    
    # 5. Save output
    output_path = "api/v1/showtimes.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(filtered_showtimes, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully generated {output_path} with {len(filtered_showtimes)} listings.")

if __name__ == '__main__':
    main()
