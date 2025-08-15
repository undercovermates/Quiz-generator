import os
import requests
from flask import Flask, request, jsonify, send_from_directory

# --- Configuration for Search APIs ---
# Replace with your actual API keys
GOOGLE_API_KEY = 'YOUR_GOOGLE_API_KEY'
GOOGLE_CX = 'YOUR_GOOGLE_CX'
BING_API_KEY = 'YOUR_BING_API_KEY'

app = Flask(__name__, static_folder='public')

def search_wikipedia(query):
    try:
        url = f"https://en.wikipedia.org/w/api.php?action=opensearch&search={query}&limit=10&namespace=0&format=json"
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        _, titles, snippets, urls = data
        return [{'title': title, 'snippet': snippet, 'url': url} for title, snippet, url in zip(titles, snippets, urls)]
    except requests.RequestException as e:
        print(f"Wikipedia API error: {e}")
        return []

def search_google(query):
    if GOOGLE_API_KEY == 'YOUR_GOOGLE_API_KEY' or GOOGLE_CX == 'YOUR_GOOGLE_CX':
        print('Google API key or CX not configured. Skipping Google search.')
        return []
    try:
        url = f"https://www.googleapis.com/customsearch/v1?key={GOOGLE_API_KEY}&cx={GOOGLE_CX}&q={query}"
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        if 'items' not in data:
            return []
        return [{'title': item.get('title'), 'snippet': item.get('snippet'), 'url': item.get('link')} for item in data['items']]
    except requests.RequestException as e:
        print(f"Google Search API error: {e}")
        return []

def search_bing(query):
    if BING_API_KEY == 'YOUR_BING_API_KEY':
        print('Bing API key not configured. Skipping Bing search.')
        return []
    try:
        url = f"https://api.bing.microsoft.com/v7.0/search?q={query}"
        headers = {'Ocp-Apim-Subscription-Key': BING_API_KEY}
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        if 'webPages' not in data or 'value' not in data['webPages']:
            return []
        return [{'title': item.get('name'), 'snippet': item.get('snippet'), 'url': item.get('url')} for item in data['webPages']['value']]
    except requests.RequestException as e:
        print(f"Bing Search API error: {e}")
        return []

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/search', methods=['POST'])
def search():
    data = request.get_json()
    query = data.get('query')
    source = data.get('source')

    if not query:
        return jsonify({'error': 'Query is required'}), 400

    print(f'Search query received: "{query}" from source: "{source}"')

    results = []
    if source == 'google':
        results = search_google(query)
    elif source == 'bing':
        results = search_bing(query)
    elif source == 'wikipedia':
        results = search_wikipedia(query)
    else: # Default or 'all' sources
        results = search_wikipedia(query)
        if not results:
            results = search_google(query)
        if not results:
            results = search_bing(query)

    return jsonify(results)

if __name__ == '__main__':
    app.run(port=3000, debug=True)
