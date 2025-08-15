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
        if (!data.query.search || data.query.search.length === 0) {
            return null;
        }
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

function generateRuleBasedQuestions(content, count) {
    if (!content) {
        return [];
    }

    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    if (sentences.length < 4) {
        return [];
    }

    const questions = [];
    for (let i = 0; i < count; i++) {
        const shuffledSentences = sentences.sort(() => 0.5 - Math.random());
        const uniqueSentences = [...new Set(shuffledSentences)];

        if (uniqueSentences.length < 4) {
            continue;
        }

        const options = uniqueSentences.slice(0, 4);
        const correctAnswer = options[0];

        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }

        const correctIndex = options.indexOf(correctAnswer);

        questions.push({
            question: "Which of the following statements is most accurate?",
            options: options,
            correct: correctIndex,
            explanation: `This information is based on web search results. The correct statement is: "${correctAnswer}"`,
        });
    }
    return questions;
}

async function generateAiQuestions(content, difficulty, count) {
    if (!content || !process.env.OPENAI_API_KEY && openai.apiKey === 'YOUR_OPENAI_API_KEY') {
        console.log('OpenAI API key not configured or content is empty. Skipping AI generation.');
        return [];
    }

    const prompt = `
        Based on the following text, generate a JSON object containing a "questions" key, which is an array of ${count} multiple-choice quiz questions.
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
        return result.questions || [];
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
    const questionCount = count || 5;

    if (!query) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Query is required' }) };
    }

    console.log(`Search query received: "${query}" with difficulty: "${difficulty}"`);

    try {
        const wikipediaContent = await searchWikipedia(query);
        if (!wikipediaContent) {
            return { statusCode: 404, body: JSON.stringify({ error: 'Could not find a Wikipedia article for that subject.' }) };
        }

        let questions = await generateAiQuestions(wikipediaContent, difficulty, questionCount);

        if (questions.length === 0) {
            console.log('AI question generation failed. Falling back to rule-based generation.');
            questions = generateRuleBasedQuestions(wikipediaContent, questionCount);
        }

        if (questions.length === 0) {
            return { statusCode: 500, body: JSON.stringify({ error: 'Could not generate questions for that subject.' }) };
        }

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
