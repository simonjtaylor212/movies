import json
import re
import unicodedata
import sys

def normalize_title(t):
    if not t:
        return ""
    s = unicodedata.normalize('NFD', t)
    s = "".join([c for c in s if not unicodedata.combining(c)])
    return re.sub(r'[^a-z0-9]', '', s.lower())

def main():
    # Set sys.stdout to handle utf-8 if possible
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    path = "movie_title_translations.json"
    with open(path, "r", encoding="utf-8") as f:
        translations = json.load(f)
    
    # Group by normalized title
    groups = {}
    for key, val in translations.items():
        norm = normalize_title(key)
        if norm not in groups:
            groups[norm] = []
        groups[norm].append((key, val))
        
    deduplicated = {}
    for norm, items in groups.items():
        if len(items) == 1:
            key, val = items[0]
            deduplicated[key] = val
        else:
            best_item = None
            for item in items:
                k, v = item
                if best_item is None:
                    best_item = item
                    continue
                
                best_k, best_v = best_item
                
                # Check translation presence
                if v and not best_v:
                    best_item = item
                    continue
                elif not v and best_v:
                    continue
                
                # If translation presence is same, prefer title/mixed case
                # e.g. "El Drama" vs "EL DRAMA" or "El drama"
                # Check how many uppercase characters, but not all uppercase.
                def score_casing(s):
                    if s.isupper():
                        return 1 # all upper is bad
                    if s.islower():
                        return 2 # all lower is okay but not best
                    return 3 # mixed/title case is best
                
                if score_casing(k) > score_casing(best_k):
                    best_item = item
            
            try:
                print(f"Duplicates for '{norm}': Selected '{best_item[0]}' over {[x[0] for x in items if x[0] != best_item[0]]}")
            except Exception:
                pass
            deduplicated[best_item[0]] = best_item[1]
            
    # Save sorted output
    sorted_translations = dict(sorted(deduplicated.items()))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(sorted_translations, f, ensure_ascii=False, indent=2)
    print("Deduplication complete!")

if __name__ == "__main__":
    main()
