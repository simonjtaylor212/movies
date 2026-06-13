import requests
from bs4 import BeautifulSoup
from collections import defaultdict
import datetime

urls = {
    "El Ingenio": "https://www.mk2cines.es/el-ingenio-velez-malaga/es/el-ingenio-velez-malaga/vose",
    "Malaga Nostrum": "https://www.mk2cines.es/malaga-nostrum-malaga/es/malaga-nostrum-malaga/vose"
}

data = defaultdict(lambda: defaultdict(list))

for venue_name, url in urls.items():
    response = requests.get(url)
    soup = BeautifulSoup(response.content, 'html.parser')

    # Dates are in divs with class "rotulo_dia"
    # Their corresponding movies are in "contenedor_cines cines-X"

    days = soup.select('.rotulo_dia')

    for day_elem in days:
        day_text = day_elem.get_text(strip=True)
        num = day_elem.get('data-num')
        if not num:
            continue

        cines_container = soup.select_one(f'.cines-{num}')
        if not cines_container:
            continue

        for horarios in cines_container.select('.horarios'):
            title_elem = horarios.select_one('.peli p.gibsonT b')
            if not title_elem:
                continue
            title = title_elem.get_text(strip=True)

            times = []
            for hora_elem in horarios.select('.horas-cine a'):
                # time text is inside a tag, excluding the span "VOSE"
                # using recursive=False to get text nodes directly, or strip out span
                # e.g. <a...><span>VOSE</span>11:50</a>
                time_str = hora_elem.get_text(strip=True).replace('VOSE', '')
                times.append(time_str)

            if times:
                data[venue_name][day_text].append({
                    "title": title,
                    "times": times
                })

html_content = "<html>\n<head><title>VOSE Movies</title></head>\n<body>\n<h1>VOSE Movies Showtimes</h1>\n"

for venue, dates in data.items():
    html_content += f"<h2>{venue}</h2>\n"
    for date, movies in dates.items():
        html_content += f"<h3>{date}</h3>\n<ul>\n"
        for movie in movies:
            times_str = ", ".join(movie['times'])
            html_content += f"<li><strong>{movie['title']}</strong>: {times_str}</li>\n"
        html_content += "</ul>\n"

html_content += "</body>\n</html>"

with open('movies.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print("Done")
