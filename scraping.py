import requests
from bs4 import BeautifulSoup
url = "https://cantantesfamosos.net/"
res = requests.get(url)
soup = BeautifulSoup(res.content, 'html.parser')
cantantes = soup.find_all('h3')
top_20_cantantes = [cantante.get_text() for cantante in cantantes[:10]] 
cantante_list = top_20_cantantes
print(cantante_list)