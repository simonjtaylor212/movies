import re
import os
import json
from datetime import datetime
from playwright.sync_api import sync_playwright

def scrape_ocine(movie_langs=None):
    from scrape_and_compile import get_spain_timezone, normalize_title
    if movie_langs is None:
        movie_langs = {}
        
    print("Scraping Ocine Serrallo...")
    sessions_list = []
    
    headless_env = os.environ.get("OCINE_HEADLESS", "true").lower() == "true"
    
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=headless_env,
                args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
            )
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                viewport={"width": 1280, "height": 720}
            )
            context.add_init_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            page = context.new_page()
            
            sessions_data = []
            
            def handle_response(res):
                if "api/v1/sessions" in res.url:
                    try:
                        sessions_data.append(res.json())
                    except Exception as e:
                        print(f"Error parsing sessions response: {e}")

            page.on("response", handle_response)
            page.goto("https://tickets.ocineserrallo.es/?nocap=1#/SeleccioPelicula", wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1000)
            
            if not sessions_data:
                print("Error: Could not retrieve Ocine sessions payload")
                browser.close()
                return []
                
            data = sessions_data[0]
            pelis = data.get("pelicules", [])
            spain_tz = get_spain_timezone()
            today_local = datetime.now(spain_tz).date()
            norm_movie_langs = {normalize_title(k): v for k, v in movie_langs.items()}

            for peli in pelis:
                p_id = peli.get("id")
                if not p_id:
                    continue
                    
                peli_detail = page.evaluate(f"""async () => {{
                    try {{
                        const r = await fetch('/api/v1/pelicula/{p_id}?lang=es');
                        return await r.json();
                    }} catch(e) {{
                        return null;
                    }}
                }}""")
                
                if not peli_detail:
                    continue

                sub_pelis = peli_detail.get("subPelicules", [])
                for sp in sub_pelis:
                    props = sp.get("propietats", [])
                    prop_descs = [d.lower() for d in sp.get("propietatsDesc", [])]
                    sp_title = sp.get("titol", "")

                    is_vose = 14 in props or any("vose" in d for d in prop_descs) or "vose" in sp_title.lower()
                    if not is_vose:
                        continue

                    clean_title = re.sub(r'(?i)\(vose\)|\bVOSE\b|\(atmos\)|\batmos\b', '', sp_title).strip()
                    clean_title = re.sub(r'\s+', ' ', clean_title).strip(" -")

                    for st in sp.get("sessions", []):
                        date_val = st.get("data")
                        if not date_val:
                            continue

                        try:
                            session_date = datetime.strptime(date_val, "%Y-%m-%d").date()
                            if session_date < today_local:
                                continue
                        except Exception:
                            pass

                        time_raw = st.get("hora", "")
                        time_val = time_raw[:5] if time_raw else ""
                        plan_id = st.get("planificacio")

                        booking_url = f"https://tickets.ocineserrallo.es/?nocap=1#/SeleccioButacas/{plan_id}"
                        norm_title = normalize_title(clean_title)
                        original_lang = norm_movie_langs.get(norm_title, "")

                        sessions_list.append({
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
                        })
            browser.close()
    except Exception as e:
        print(f"Error scraping Ocine Serrallo: {e}")
        return []
        
    print(f"Ocine Serrallo: Scraped {len(sessions_list)} sessions.")
    return sessions_list

if __name__ == "__main__":
    sessions = scrape_ocine()
    for s in sessions[:5]:
        print(s)
