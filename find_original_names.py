import os
import sys
import re
import json
import urllib.parse
import requests
from bs4 import BeautifulSoup

# Configure UTF-8 encoding for standard output on Windows
if sys.platform.startswith("win"):
    sys.stdout.reconfigure(encoding="utf-8")

def get_original_title_scraping(spanish_title):
    # Clean up prefixes/suffixes to keep search effective
    clean_title = spanish_title.split(" - ")[0].split(" (")[0]
    
    search_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9"
    }
    detail_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
    }
    
    search_query = urllib.parse.quote(clean_title)
    search_url = f"https://www.themoviedb.org/search?query={search_query}"
    
    try:
        r = requests.get(search_url, headers=search_headers, timeout=10)
        r.raise_for_status()
        
        soup = BeautifulSoup(r.text, "html.parser")
        
        # Look for the first movie card
        results_div = soup.find("div", class_="search_results movie")
        if not results_div:
            results_div = soup
            
        first_card = results_div.find("div", class_="comp:media-card")
        if not first_card:
            first_card = results_div.find("div", class_="card")
            
        if not first_card:
            return None
            
        # Find movie link
        movie_link = first_card.find("a", href=lambda href: href and "/movie/" in href)
        if not movie_link:
            return None
            
        movie_href = movie_link["href"]
        movie_id_match = re.search(r"/movie/(\d+)", movie_href)
        if not movie_id_match:
            return None
            
        movie_id = movie_id_match.group(1)
        movie_url = f"https://www.themoviedb.org/movie/{movie_id}"
        
        # Fetch movie details page with English Accept-Language
        r_movie = requests.get(movie_url, headers=detail_headers, timeout=10)
        r_movie.raise_for_status()
        
        movie_soup = BeautifulSoup(r_movie.text, "html.parser")
        
        # Check sidebar for Original Title
        for p in movie_soup.find_all("p", class_="wrap"):
            if p.strong and "Original Title" in p.strong.text:
                return p.text.replace("Original Title", "").strip()
                
        # Fallback to og:title (which will be English under English Accept-Language)
        meta_og = movie_soup.find("meta", property="og:title")
        if meta_og and meta_og.get("content"):
            return meta_og["content"].strip()
            
        # Fallback to title tag
        title_tag = movie_soup.find("title")
        if title_tag:
            title_text = title_tag.text
            title_text = re.sub(r"\s*[—–-]\s*The Movie Database.*$", "", title_text, flags=re.IGNORECASE).strip()
            return title_text
            
    except Exception as e:
        print(f"    (TMDB Scraper warning: {e})")
        
    return None

def get_original_title_wikidata(spanish_title):
    clean_title = spanish_title.split(" - ")[0].split(" (")[0]
    headers = {
        "User-Agent": "VOSE-Movie-Scraper/1.0 (contact: simonjtaylor212@gmail.com)"
    }
    
    search_url = f"https://www.wikidata.org/w/api.php?action=wbsearchentities&search={urllib.parse.quote(clean_title)}&language=es&format=json&type=item"
    
    try:
        r = requests.get(search_url, headers=headers, timeout=10)
        r.raise_for_status()
        data = r.json()
        
        results = data.get("search", [])
        if not results:
            return None
            
        best_id = None
        for res in results:
            desc = res.get("description", "").lower()
            if any(keyword in desc for keyword in ["película", "film", "movie", "obra", "ópera", "opera", "show"]):
                best_id = res["id"]
                break
                
        if not best_id:
            best_id = results[0]["id"]
            
        entity_url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={best_id}&format=json"
        r = requests.get(entity_url, headers=headers, timeout=10)
        r.raise_for_status()
        entity_data = r.json()
        
        entity = entity_data.get("entities", {}).get(best_id, {})
        claims = entity.get("claims", {})
        
        # Try P1476 (Original Title claim)
        if "P1476" in claims and claims["P1476"]:
            val = claims["P1476"][0].get("mainsnak", {}).get("datavalue", {}).get("value", {})
            if isinstance(val, dict) and "text" in val:
                return val["text"]
                
        # Try English label
        labels = entity.get("labels", {})
        if "en" in labels:
            return labels["en"]["value"]
            
        # Try Spanish label
        if "es" in labels:
            return labels["es"]["value"]
            
    except Exception as e:
        print(f"    (Wikidata API warning: {e})")
        
    return None

def main():
    translations_path = "movie_title_translations.json"
    if not os.path.exists(translations_path):
        print(f"Error: {translations_path} not found.")
        sys.exit(1)
        
    with open(translations_path, "r", encoding="utf-8") as f:
        translations = json.load(f)
        
    missing_keys = [k for k, v in translations.items() if not v or v.strip() == ""]
    if not missing_keys:
        print("No missing movie translations to find.")
        return
        
    print(f"Found {len(missing_keys)} movies without original names.")
    
    api_key = os.environ.get("TMDB_API_KEY")
    if api_key:
        print("TMDB_API_KEY environment variable detected. Using official TMDB API.")
    else:
        print("No TMDB_API_KEY detected. Using keyless TMDB scraper and Wikidata fallbacks.")
        
    updated_count = 0
    for key in missing_keys:
        print(f"\nSearching for: '{key}'")
        original_title = None
        
        # 1. Try TMDB API if key exists
        if api_key:
            try:
                clean_title = key.split(" - ")[0].split(" (")[0]
                search_url = f"https://api.themoviedb.org/3/search/movie?api_key={api_key}&query={urllib.parse.quote(clean_title)}&language=es"
                r = requests.get(search_url, timeout=10)
                r.raise_for_status()
                data = r.json()
                results = data.get("results", [])
                if results:
                    original_title = results[0].get("original_title")
                    if original_title:
                        print(f"  -> Found via TMDB API: '{original_title}'")
            except Exception as e:
                print(f"  (TMDB API error: {e})")
                
        # 2. Try TMDB web scraping fallback
        if not original_title:
            original_title = get_original_title_scraping(key)
            if original_title:
                print(f"  -> Found via TMDB Web: '{original_title}'")
                
        # 3. Try Wikidata fallback
        if not original_title:
            original_title = get_original_title_wikidata(key)
            if original_title:
                print(f"  -> Found via Wikidata: '{original_title}'")
                
        if original_title:
            translations[key] = original_title
            updated_count += 1
        else:
            print(f"  -> Could not resolve original name for '{key}'")
            
    if updated_count > 0:
        # Sort translations alphabetically by Spanish key
        sorted_translations = dict(sorted(translations.items()))
        with open(translations_path, "w", encoding="utf-8") as f:
            json.dump(sorted_translations, f, ensure_ascii=False, indent=2)
        print(f"\nSuccessfully updated {updated_count} translation(s) in {translations_path}.")
    else:
        print("\nNo translations were updated.")

if __name__ == "__main__":
    main()
