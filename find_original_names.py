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

def get_movie_metadata(spanish_title):
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
    
    metadata = {
        "original_title": "",
        "release_date": "",
        "rating": "",
        "duration": "",
        "poster_url": ""
    }

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
        
        # 1. Scrape metadata from search result card if possible (e.g. poster)
        poster_img = first_card.find("img")
        if poster_img and poster_img.get("src"):
            metadata["poster_url"] = "https://media.themoviedb.org/t/p/w300_and_h450_face" + poster_img["src"].split("/t/p/")[1] if "/t/p/" in poster_img["src"] else poster_img["src"]

        # 2. Fetch movie details page for more accurate info
        r_movie = requests.get(movie_url, headers=detail_headers, timeout=10)
        r_movie.raise_for_status()
        movie_soup = BeautifulSoup(r_movie.text, "html.parser")
        
        # Original Title
        for p in movie_soup.find_all("p", class_="wrap"):
            if p.strong and "Original Title" in p.strong.text:
                metadata["original_title"] = p.text.replace("Original Title", "").strip()
                break
        
        if not metadata["original_title"]:
            meta_og = movie_soup.find("meta", property="og:title")
            if meta_og:
                metadata["original_title"] = meta_og["content"].strip()

        # Release Date (from sidebar)
        for p in movie_soup.find_all("p"):
            if p.strong and "Release Date" in p.strong.text:
                date_match = re.search(r"(\d{2}/\d{2}/\d{4})", p.text)
                if date_match:
                    # Convert to YYYY-MM-DD
                    d, m, y = date_match.group(1).split("/")
                    metadata["release_date"] = f"{y}-{m}-{d}"
                break

        # Rating
        rating_div = movie_soup.find("div", class_="user_score_chart")
        if rating_div and rating_div.get("data-percent"):
            metadata["rating"] = str(round(float(rating_div["data-percent"]) / 10, 1))

        # Runtime
        runtime_span = movie_soup.find("span", class_="runtime")
        if runtime_span:
            metadata["duration"] = runtime_span.text.strip()
            
        return metadata
            
    except Exception as e:
        print(f"    (TMDB Scraper warning: {e})")
        
    return None

def main():
    translations_path = "movie_title_translations.json"
    if not os.path.exists(translations_path):
        print(f"Error: {translations_path} not found.")
        sys.exit(1)
        
    with open(translations_path, "r", encoding="utf-8") as f:
        translations = json.load(f)
        
    # Standardize translations to object format if they are strings
    for k, v in translations.items():
        if isinstance(v, str):
            translations[k] = {
                "original_title": v,
                "release_date": "",
                "rating": "",
                "duration": "",
                "poster_url": ""
            }

    missing_keys = [k for k, v in translations.items() if not v.get("original_title") or not v.get("release_date")]
    if not missing_keys:
        print("No missing movie metadata to find.")
        return
        
    print(f"Found {len(missing_keys)} movies needing metadata updates.")
    
    updated_count = 0
    for key in missing_keys:
        print(f"\nFetching metadata for: '{key}'")
        metadata = get_movie_metadata(key)
        
        if metadata:
            # Preserve existing original_title if scraper fails to find it but we already had it
            if not metadata["original_title"] and translations[key].get("original_title"):
                metadata["original_title"] = translations[key]["original_title"]

            translations[key] = metadata
            updated_count += 1
            print(f"  -> Success: {metadata['original_title']} ({metadata['release_date']})")
        else:
            print(f"  -> Could not resolve metadata for '{key}'")
            
    if updated_count > 0:
        sorted_translations = dict(sorted(translations.items()))
        with open(translations_path, "w", encoding="utf-8") as f:
            json.dump(sorted_translations, f, ensure_ascii=False, indent=2)
        print(f"\nSuccessfully updated {updated_count} metadata entries in {translations_path}.")
    else:
        print("\nNo metadata was updated.")

if __name__ == "__main__":
    main()
