const fetch = require('node-fetch');
const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY',
});

async function searchWikipedia(query) {
    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;
        const response = await fetch(url);
        const data = await response.json();
        const pageId = data.query.search[0].pageid;

        const contentUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&pageids=${pageId}&explaintext&format=json`;
        const contentResponse = await fetch(contentUrl);
        const contentData = await contentResponse.json();
        return contentData.query.pages[pageId].extract;
    } catch (error) {
        console.error('Wikipedia API error:', error);
        return null;
    }
}

async function generateAiQuestions(content, difficulty, count) {
    if (!content) {
        return [];
    }

    const prompt = `
        Based on the following text, generate a JSON array of ${count} multiple-choice quiz questions.
        The difficulty of the questions should be ${difficulty}.
        Each question object in the array should have the following format:
        {
            "question": "The question text",
            "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
            "correct": 0, // The index of the correct option in the "options" array
            "explanation": "A brief explanation of why the answer is correct."
        }

        Here is the text to base the questions on:
        ---
        ${content.substring(0, 3000)}
        ---
    `;

    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
        });

        const result = JSON.parse(completion.choices[0].message.content);
        // The prompt asks for an array, but the model might wrap it in a root key
        return result.questions || result;
    } catch (error) {
        console.error("OpenAI API error:", error);
        return [];
    }
}


exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const { query, difficulty, count } = JSON.parse(event.body);

    if (!query) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Query is required' }) };
    }

    console.log(`Search query received: "${query}" with difficulty: "${difficulty}"`);

    try {
        const wikipediaContent = await searchWikipedia(query);
        if (!wikipediaContent) {
            return { statusCode: 500, body: JSON.stringify({ error: 'Could not fetch content from Wikipedia.' }) };
        }

        const questions = await generateAiQuestions(wikipediaContent, difficulty, count || 5);

        return {
            statusCode: 200,
            body: JSON.stringify(questions),
        };
    } catch (error) {
        console.error('An error occurred during search:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'An unexpected error occurred during search.' }),
        };
    }
};
