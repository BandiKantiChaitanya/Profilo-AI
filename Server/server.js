import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import axios from 'axios';
import { spawn } from 'child_process';
import { pool } from './db.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// in memory profiles data
let profileCache = [];
let cacheReady   = false;
 
async function loadProfileCache() {
  try {

    const result = await pool.query(`SELECT * FROM profiles`);
    profileCache = result.rows.map(p => ({
      ...p,
      embedding: JSON.parse(p.embedding)
    }));
    cacheReady = true;
  } catch (err) {
    console.error('❌ Failed to load profile cache:', err.message);
    setTimeout(loadProfileCache, 10000);
  }
}
 
loadProfileCache();


// convert query to embedding
async function getEmbeddingFromPython(text) {
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['embed.py', text]);
    let data = '';
    let error = '';
    py.stdout.on('data', (chunk) => data += chunk);
    py.stderr.on('data', (err) => error += err);
    py.on('close', (code) => {
      if (code !== 0) return reject(error);
      try {
        const parsed = JSON.parse(data);
        resolve(parsed);
      } catch (e) {
        reject('Failed to parse embedding');
      }
    });
  });
}


// cosine similarity
function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}


// rag implementation
async function getGeminiResponse(query, matchedProducts, history) {

  const context = matchedProducts.map(p => 
    `Name: ${p.name}
Headline: ${p.headline}
Short: ${p.short_description}
Full: ${p.long_description}
Skills: ${p.skills}
Contact:${p.contact}
    `
  ).join('\n\n');

  const conversationText = history.map(h => 
    `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`
  ).join('\n');

  const prompt = `
You are an AI assistant who help to find relevant freelance experts and mentors.

Use the conversation and expert profiles to suggest experts. Show ALL profiles provided to you, up to 3. Do not skip any profile you receive.

Conversation:
${conversationText}

User Query:
${query}

Expert Profiles:
${context}

Rules:

- If the user asks general questions (who are you / what can you do), briefly explain that you help users find expert freelancers for users.

- When suggesting experts, always use this format:

Name: [name] - headline
Skills:
Short Description: Write a 1–2 sentence explanation of how this expert helps users based on their skills and profile.
Contact:[contact url]

- Only send these fields when the user asks for more details about a specific expert:

Name: [name] - headline
Long Description: Write a detailed explanation (2–3 sentences) about how this expert helps users, based on their experience and skills.
Contact:[contact url]

- Always show ALL relevant experts (up to 3). Never show only 1 if more are relevant.
- strictly follow this for every prompt
- Do not add extra formatting, tables, or explanations.
- Start with 1 short line introducing the experts.
- End by asking if the user wants more information.
`;

  // Gemini with fallback models on 503/429
  const models = [
    'gemini-2.5-flash',
    'gemini-1.5-flash',
    'gemini-1.5-flash-8b'
  ];

  for (const model of models) {
    try {
      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        { contents: [{ parts: [{ text: prompt }] }] },
        {
          headers: {
            'x-goog-api-key': GEMINI_API_KEY,
            'Content-Type': 'application/json',
          }
        }
      );
      return geminiRes.data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
    } catch (err) {
      const status = err.response?.status;
      console.warn(`⚠️ ${model} failed with ${status}, trying next...`);
      if (status !== 503 && status !== 429) throw err;
    }
  }

  throw new Error('All Gemini models unavailable.');
}


app.post('/chat', async (req, res) => {
  const { message, history } = req.body;
   
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  if (!cacheReady) {
    return res.status(503).json({ error: 'Server is still warming up. Please try again in a moment.' });
  }

  try {
    const safeHistory = Array.isArray(history)
      ? history.filter(h => h?.role && h?.content)
      : [];

    let topResults;

    // Detect "yes" / "tell about X" follow-ups — skip embedding, use context
    const isFollowUp = /^(yes|yeah|yep|sure|ok|okay|tell me more|more details?)$/i.test(message.trim());
    const nameMatch  = message.match(/(?:tell|more) about\s+([a-z]+)/i);

    if (isFollowUp || nameMatch) {
      // Find who was last mentioned in assistant history
      let lastExpert = null;

      if (nameMatch) {
        // User named someone explicitly — use that
        lastExpert = nameMatch[1].trim();
      } else {
        // "yes" — find last Name: in assistant messages
        for (let i = safeHistory.length - 1; i >= 0; i--) {
          if (safeHistory[i].role === 'assistant') {
            const match = safeHistory[i].content?.match(/Name:\s*([^\n\-]+)/);
            if (match) { lastExpert = match[1].trim(); break; }
          }
        }
      }



      const target = lastExpert
        ? profileCache.find(p => p.name.toLowerCase().includes(lastExpert.toLowerCase()))
        : null;

      topResults = target
        ? [target, ...profileCache.filter(p => p !== target).slice(0, 4)]
        : profileCache.slice(0, 5);

    } else {
      // Normal semantic search
      const queryEmbedding = await getEmbeddingFromPython(message);
      const scored = profileCache.map(p => ({
        ...p,
        score: cosineSimilarity(queryEmbedding, p.embedding)
      }));
      scored.sort((a, b) => b.score - a.score);
      topResults = scored.slice(0, 3);
    }

    const reply = await getGeminiResponse(message, topResults, safeHistory);
    res.json({ reply });

  } catch (err) {
    console.error('❌ Gemini Error:', err.message);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
});


// Health + wake endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status:    'ok',
      cacheReady,
      profiles:  profileCache.length,
      timestamp: Date.now()
    });
  } catch {
    res.status(503).json({ status: 'starting', cacheReady: false });
  }
});


app.get('/wake', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'awake', cacheReady });
  } catch (err) {
    res.status(500).json({ status: 'error' });
  }
});


app.post('/create-profile', async (req, res) => {
  const { name, headline, short_description, long_description, skills, contact } = req.body;
 
  if (!name || !headline || !short_description || !long_description || !skills || !contact) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
 
  try {
    const textToEmbed = `
Headline: ${headline}
Short: ${short_description}
Long: ${long_description}
Skills: ${skills}
    `;
 
    const embedding = await getEmbeddingFromPython(textToEmbed);
 
   const result= await pool.query(
      `INSERT INTO profiles
       (name, headline, short_description, long_description, skills, contact, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [name, headline, short_description, long_description, skills, contact, JSON.stringify(embedding)]
    );
 
    await loadProfileCache();

    const newProfile = result.rows[0];
    profileCache.push({
      ...newProfile,
      embedding  // already parsed array, no JSON.parse needed
    });
 
    res.json({ success: true, message: `Profile for ${name} created successfully!` });
 
  } catch (err) {
    console.error('❌ /create-profile error:', err.message);
    res.status(500).json({ error: 'Failed to create profile. Please try again.' });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running at ${PORT}`);
});