import requests
from bs4 import BeautifulSoup

urls = [
    "https://www.mk2cines.es/el-ingenio-velez-malaga/es/el-ingenio-velez-malaga/vose",
    "https://www.mk2cines.es/malaga-nostrum-malaga/es/malaga-nostrum-malaga/vose"
]

movies = set()

for url in urls:
    response = requests.get(url)
    soup = BeautifulSoup(response.content, 'html.parser')
    for peli in soup.select('.horarios .peli'):
        title_elem = peli.select_one('p.gibsonT b')
        if title_elem:
            title = title_elem.get_text(strip=True)
            movies.add(title)

movies = list(movies)

html_content = "<html>\n<head><title>VOSE Movies</title></head>\n<body>\n<h1>VOSE Movies</h1>\n<ul>\n"
for m in movies:
    html_content += f"<li>{m}</li>\n"
html_content += "</ul>\n</body>\n</html>"

with open('movies.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print(movies)
