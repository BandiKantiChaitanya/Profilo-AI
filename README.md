# Profilo AI

An AI-powered freelance expert finder. Users describe what they need and the assistant finds the most relevant experts from the database using semantic search and RAG (Retrieval-Augmented Generation).

---
## Live Demo


[Live Demo](https://profilo-ai-sand.vercel.app/)


---

## Screenshots

### Chat Interface — Home
![Home Screen](/frontend/screenshots/home.png)

### Expert Cards — Search Result
![Expert Cards](/frontend/screenshots/expert-cards.png)

### Long Description — Detail View
![Long Description](/frontend/screenshots/long-description.png)

### Create Profile Form
![Create Profile](/frontend//screenshots/create-profile.png)


## What it does

- User types a query like "I need a React developer" or clicks a topic
- Backend converts the query into a vector embedding using a Python sentence-transformer model
- That embedding is compared against all stored profile embeddings using cosine similarity
- The top 3 matching profiles are passed to Gemini as context
- Gemini generates a natural language response suggesting the right experts with **profile cards**
- User can ask follow-up questions like "tell me more about Aarav" to get a **detailed description**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Backend | Node.js, Express |
| AI Model | Google Gemini 2.5 Flash (with 1.5 Flash fallback) |
| Embeddings | Python `sentence-transformers` (all-MiniLM-L6-v2) |
| Database | PostgreSQL on Neon (serverless) |
| Frontend Deploy | Vercel |
| Backend Deploy | Render |

---

## Project Structure

```
profilo-ai/
│
├── Server/
│   ├── server.js          # Express backend — main API
│   ├── db.js              # Neon PostgreSQL pool connection
│   ├── embed.py           # Python script — generates embeddings
│   ├── populate_db.js     # One-time script — seeds profiles from CSV
│   ├── profiles.csv       # Sample profile data
│   └── .env               # Environment variables (not committed)
│
├── Frontend/
│   ├── index.html         # Main chat interface
│   ├── create.html        # Profile creation form
│   ├── style.css          # All styles
│   └── script.js          # Chat logic, health polling, card rendering
│
├── screenshots/           # README screenshots
└── README.md
```

---

## How RAG works here

```
User Query
    │
    ▼
Python embed.py
(converts query to 384-dim vector)
    │
    ▼
Cosine Similarity
(query vector vs all profile vectors in memory)
    │
    ▼
Top 3 Matching Profiles
(selected from in-memory cache)
    │
    ▼
Gemini API
(profiles sent as context, generates natural response)
    │
    ▼
Response shown to user as Profile Cards
```

---

## UI Features

### Profile Cards
Every expert is displayed as a structured card showing:
- **Name** and **Headline**
- **Skills** as a pill badge
- **Short Description** — 1–2 sentence summary of how they help
- **Contact button** — opens their LinkedIn or bio link in a new tab

This makes it easy to scan multiple experts at a glance without reading walls of text.

### Long Description on Demand
When a user asks for more details about a specific expert (e.g. "tell me more about Aarav" or "yes"), the UI switches to a detail view showing:
- Expert name and headline
- **Long Description** — 2–3 sentences about their background and experience
- Inline **Contact →** link

The backend detects follow-up messages, skips the embedding search, and pins the correct expert to the top of the context so Gemini always details the right person.

### Typing Indicator
Three animated dots appear while waiting for a response so users know the AI is working.

### Server Status Banner
Since the backend is hosted on Render's free tier (which sleeps after inactivity), the frontend polls `/health` every few seconds and shows a friendly banner:
- **"Server is waking up..."** — during Render cold start (~30 seconds)
- **"Loading expert profiles..."** — while Neon DB connection warms up
- Input is disabled during this time so users don't send requests that will fail

---

## API Routes

### `POST /chat`
Main chat endpoint. Accepts user message and conversation history, returns AI response.

**Request:**
```json
{
  "message": "I need a logo designer",
  "history": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

**Response:**
```json
{
  "reply": "Here are some experts who can help..."
}
```

---

### `POST /create-profile`
Creates a new expert profile. Generates embedding and stores in DB. New profile is immediately searchable — no server restart needed.

**Request:**
```json
{
  "name": "Rahul",
  "headline": "Backend Developer",
  "short_description": "Node.js developer focused on AI-powered systems.",
  "long_description": "Backend developer with 2 years MERN experience...",
  "skills": "Node.js, Express, SQL, Python, RAG",
  "contact": "https://linkedin.com/in/rahul"
}
```

## Database Schema

```sql
CREATE TABLE profiles (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  headline          TEXT NOT NULL,
  short_description TEXT NOT NULL,
  long_description  TEXT NOT NULL,
  skills            TEXT NOT NULL,
  contact           TEXT NOT NULL,
  embedding         TEXT NOT NULL  -- JSON stringified float array
);
```

---

## Environment Variables

Create a `.env` file in the `Server/` folder:

```env
DATABASE_URL=your_neon_connection_string
GEMINI_API_KEY=your_gemini_api_key
PORT=5000
```


## Key Design Decisions

**Profile cards UI** — instead of showing plain text responses, every expert is rendered as a structured card with name, headline, skills pill, short description, and a Contact button. When a user asks for more details, the UI switches to a detail card showing the long description and an inline Contact → link. This two-level display keeps initial results scannable while still allowing deeper info on demand.

**In-memory profile cache** — profiles are loaded from Neon DB once on server startup and kept in RAM. Every chat request does zero DB calls for similarity search. New profiles created via `/create-profile` are pushed directly into the cache without a reload.

**Python for embeddings** — `sentence-transformers` produces high quality semantic embeddings. The model (`all-MiniLM-L6-v2`) is small (80MB) and fast while still being accurate for semantic similarity.

**Gemini fallback chain** — if `gemini-2.5-flash` returns 503 (overloaded), the server automatically retries with `gemini-1.5-flash`, then `gemini-1.5-flash-8b`. Users never see a failure from model overload.

**Follow-up detection** — when a user says "yes" or "tell me about Aarav", the backend skips the embedding search and instead finds the specific profile from cache, passing it first to Gemini with full conversation history. This ensures the correct expert is always detailed.

**Frontend health polling** — the frontend polls `/health` every 2 seconds when the server is offline, 3 seconds while cache is loading, and 30 seconds when fully ready. Users see a clear status banner so they know to wait during cold starts.
