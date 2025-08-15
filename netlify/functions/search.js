const fetch = require('node-fetch');

// --- Configuration for Search APIs ---
const GOOGLE_API_KEY = 'YOUR_GOOGLE_API_KEY';
const GOOGLE_CX = 'YOUR_GOOGLE_CX';
const BING_API_KEY = 'YOUR_BING_API_KEY';

async function searchWikipedia(query) {
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=10&namespace=0&format=json`;
        const response = await fetch(url);
        const data = await response.json();
        const [, titles, snippets, urls] = data;
        return titles.map((title, index) => ({
            title: title,
            snippet: snippets[index],
            url: urls[index],
        }));
    } catch (error) {
        console.error('Wikipedia API error:', error);
        return [];
    }
}

async function searchGoogle(query) {
    if (GOOGLE_API_KEY === 'YOUR_GOOGLE_API_KEY' || GOOGLE_CX === 'YOUR_GOOGLE_CX') {
        console.log('Google API key or CX not configured. Skipping Google search.');
        return [];
    }
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (!data.items) {
            return [];
        }
        return data.items.map(item => ({
            title: item.title,
            snippet: item.snippet,
            url: item.link,
        }));
    } catch (error) {
        console.error('Google Search API error:', error);
        return [];
    }
}

async function searchBing(query) {
    if (BING_API_KEY === 'YOUR_BING_API_KEY') {
        console.log('Bing API key not configured. Skipping Bing search.');
        return [];
    }
    try {
        const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: { 'Ocp-Apim-Subscription-Key': BING_API_KEY },
        });
        const data = await response.json();
        if (!data.webPages || !data.webPages.value) {
            return [];
        }
        return data.webPages.value.map(item => ({
            title: item.name,
            snippet: item.snippet,
            url: item.url,
        }));
    } catch (error) {
        console.error('Bing Search API error:', error);
        return [];
    }
}

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { query, source } = JSON.parse(event.body);

    if (!query) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Query is required' }) };
    }

    console.log(`Search query received: "${query}" from source: "${source}"`);

    let results = [];
    try {
        if (source === 'google') {
            results = await searchGoogle(query);
        } else if (source === 'bing') {
            results = await searchBing(query);
        } else if (source === 'wikipedia') {
            results = await searchWikipedia(query);
        } else {
            // Default or 'all' sources - try them in order
            results = await searchWikipedia(query);
            if (results.length === 0) {
                results = await searchGoogle(query);
            }
            if (results.length === 0) {
                results = await searchBing(query);
            }
        }
        return {
            statusCode: 200,
            body: JSON.stringify(results),
        };
    } catch (error) {
        console.error('An error occurred during search:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'An unexpected error occurred during search.' }),
        };
    }
};
