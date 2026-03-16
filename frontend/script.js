const topics = [
  'Job Referral','Design Logo','Portfolio Review','LinkedIn Optimization',
  'Website Hosting','Learn New Words','Profile Creation','Mock Interviews',
  'Resume Building','Freelance Work','Startup Ideas','Career Advice',
  'Personal Branding','Remote Jobs','Coding Help','Public Speaking Tips',
  'Time Management','Interview Questions','Build a Website','Social Media Strategy',
  'UI/UX Feedback','Create a Newsletter','Build Side Projects','Learn a Framework'
];

const intro           = document.getElementById('intro-section');
const topicsContainer = document.getElementById('topics-container');
const promptContainer = document.getElementById('prompt-container');
const searchInput     = document.getElementById('search-input');
const searchBtn       = document.getElementById('search-btn');
const statusBanner    = document.getElementById('status-banner');
const statusText      = document.getElementById('status-text');
const statusDot       = document.getElementById('status-dot');

const API_BASE =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:5000'
    : 'https://your-render-backend.onrender.com';


let serverOnline    = false;   
let cacheReady      = false;   
let pollInterval    = null;
let isRequestLocked = false;  

function showBanner(type, message) {
  statusBanner.className = `status-banner ${type}`;
  statusText.textContent  = message;
  statusBanner.classList.remove('hidden');
}

function hideBanner() {
  statusBanner.classList.add('hidden');
}

function setServerState(online, ready) {
  const wasOffline = !serverOnline;
  serverOnline = online;
  cacheReady   = ready;

  // Topbar dot: green when fully ready, amber otherwise
  const dot = document.getElementById('model-dot');
  if (dot) {
    dot.classList.toggle('offline', !(online && ready));
  }

  if (!online) {
    // Server is completely asleep (Render cold start)
    showBanner('waking', '⏳ Server is waking up — this takes ~30 seconds on first load. Please wait...');
    lockInput('Server is waking up...');
    // Poll aggressively — every 2 seconds when offline
    resetPoll(2000);

  } else if (online && !ready) {
    // Server is up but still loading profiles from Neon
    showBanner('loading', ' Loading expert profiles — almost ready...');
    lockInput('Loading profiles...');
    // Poll every 3 seconds until cache is ready
    resetPoll(3000);

  } else {
    // Fully online + cache ready
    hideBanner();
    unlockInput();
    // Slow polling — every 30 seconds just to detect if it goes offline
    resetPoll(30000);

    // If it just came back online, show a brief "ready" flash
    if (wasOffline) {
      showBanner('online', ' Server is ready! You can now send messages.');
      setTimeout(hideBanner, 3000);
    }
  }
}

function lockInput(placeholder) {
  searchInput.disabled     = true;
  searchBtn.disabled       = true;
  searchInput.placeholder  = placeholder;
}

function unlockInput() {
  if (isRequestLocked) return; // don't unlock if a request is in flight
  searchInput.disabled     = false;
  searchBtn.disabled       = false;
  searchInput.placeholder  = 'Message Profilo AI...';
}

function resetPoll(ms) {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(checkHealth, ms);
}

async function checkHealth() {
  try {
    const res  = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();

    if (res.ok) {
      setServerState(true, data.cacheReady === true);
    } else {
      // Server responded but returned 503 (still starting)
      setServerState(true, false);
    }
  } catch {
    // Fetch failed entirely — server is asleep
    setServerState(false, false);
  }
}

// Start polling immediately on page load
checkHealth();
resetPoll(5000); // default 5s, checkHealth adjusts this


// ─────────────────────────────────────────────
// TOPIC BUTTONS
// ─────────────────────────────────────────────
topics.forEach(topic => {
  const btn       = document.createElement('button');
  btn.className   = 'topic-btn';
  btn.textContent = topic;
  btn.onclick     = () => handleSubmit(topic);
  topicsContainer.appendChild(btn);
});

let conversationHistory = [];

function externalSubmit(text) {
  searchInput.value = text;
  handleSubmit();
}


// ─────────────────────────────────────────────
// REQUEST LOADING STATE
// ─────────────────────────────────────────────
function setLoading(state) {
  isRequestLocked      = state;
  searchInput.disabled = state;
  searchBtn.disabled   = state;
  if (!state) searchInput.placeholder = 'Message Profilo AI...';
}


// ─────────────────────────────────────────────
// TYPING INDICATOR
// ─────────────────────────────────────────────
function showTyping() {
  const wrap    = document.createElement('div');
  wrap.className = 'typing-wrapper';
  wrap.id        = 'typing-wrapper';
  const dot     = document.createElement('div');
  dot.className  = 'typing-indicator';
  dot.innerHTML  = '<span></span><span></span><span></span>';
  wrap.appendChild(dot);
  promptContainer.appendChild(wrap);
  promptContainer.scrollTop = promptContainer.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typing-wrapper');
  if (el) el.remove();
}


// ─────────────────────────────────────────────
// EXPERT CARD
// ─────────────────────────────────────────────
function buildExpertCard(name, headline, skills, description, contact) {
  const card       = document.createElement('div');
  card.className   = 'expert-card';

  const header     = document.createElement('div');
  header.className = 'expert-card-header';

  if (name) {
    const n = document.createElement('div');
    n.className = 'expert-card-name';
    n.textContent = name;
    header.appendChild(n);
  }
  if (headline) {
    const h = document.createElement('div');
    h.className = 'expert-card-headline';
    h.textContent = headline;
    header.appendChild(h);
  }
  card.appendChild(header);

  if (skills) {
    const s = document.createElement('div');
    s.className = 'expert-card-skills';
    s.textContent = skills;
    card.appendChild(s);
  }
  if (description) {
    const d = document.createElement('p');
    d.className = 'expert-card-desc';
    d.textContent = description;
    card.appendChild(d);
  }
  if (contact) {
    const a = document.createElement('a');
    a.className = 'expert-contact-btn';
    a.href = contact;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML = 'Contact &nbsp;→';
    card.appendChild(a);
  }

  return card;
}


// ─────────────────────────────────────────────
// AI WRAPPER HELPERS
// ─────────────────────────────────────────────
function createAIWrapper() {
  const resWrap      = document.createElement('div');
  resWrap.className  = 'message-wrapper response';
  const response     = document.createElement('div');
  response.className = 'prompt-response';
  return { resWrap, response };
}

function appendAI(resWrap, response) {
  resWrap.appendChild(response);
  promptContainer.appendChild(resWrap);
  promptContainer.scrollTop = promptContainer.scrollHeight;
}


// ─────────────────────────────────────────────
// MAIN SUBMIT
// ─────────────────────────────────────────────
function handleSubmit(value) {
  if (isRequestLocked) return;

  // Block if server not ready
  if (!serverOnline || !cacheReady) {
    showBanner('waking', '⏳ Server is still waking up — please wait a moment before sending.');
    return;
  }

  const input = (value || searchInput.value).trim();
  if (!input) return;

  if (intro && !intro.classList.contains('hidden')) {
    intro.classList.add('hidden');
  }

  // User bubble
  const msgWrap      = document.createElement('div');
  msgWrap.className  = 'message-wrapper user';
  const msg          = document.createElement('div');
  msg.className      = 'prompt-message';
  msg.textContent    = input;
  msgWrap.appendChild(msg);
  promptContainer.appendChild(msgWrap);
  promptContainer.scrollTop = promptContainer.scrollHeight;

  searchInput.value = '';

  conversationHistory.push({ role: 'user', content: input });
  if (conversationHistory.length > 12) conversationHistory = conversationHistory.slice(-12);

  setLoading(true);
  showTyping();

  fetch(`${API_BASE}/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message:      input,
      history:      conversationHistory,
      force_detail: input.toLowerCase().includes('yes'),
    }),
  })
  .then(res => res.json())
  .then(data => {
    hideTyping();
    setLoading(false);

    // If server returned a 503 (cache not ready)
    if (data.error) {
      const { resWrap, response } = createAIWrapper();
      const p = document.createElement('p');
      p.textContent = `⚠️ ${data.error}`;
      p.style.color = '#b55a2e';
      response.appendChild(p);
      appendAI(resWrap, response);
      return;
    }

    conversationHistory.push({ role: 'assistant', content: data.reply });
    const fullText = data.reply;
    const { resWrap, response } = createAIWrapper();

    /* ── CASE 1: Long Description (detail view) ── */
    if (fullText.includes('Long Description:')) {
      const lines = fullText.split('\n');
      let nameHeadline = '', longDesc = '', contact = '';
      let afterContact = false;
      const outroLines = [];

      lines.forEach(line => {
        const t = line.trim();
        if      (t.startsWith('Name:'))             nameHeadline = t.replace('Name:', '').trim();
        else if (t.startsWith('Long Description:')) longDesc     = t.replace('Long Description:', '').trim();
        else if (t.startsWith('Contact:'))        { contact      = t.replace('Contact:', '').replace(/[\[\]]/g, '').trim(); afterContact = true; }
        else if (afterContact && t)                outroLines.push(t);
      });

      const dash         = nameHeadline.indexOf(' - ');
      const displayName  = dash !== -1 ? nameHeadline.substring(0, dash).trim() : nameHeadline;
      const displayHline = dash !== -1 ? nameHeadline.substring(dash + 3).trim() : '';

      const detail       = document.createElement('div');
      detail.className   = 'detail-response';

      if (displayName) {
        const np = document.createElement('p');
        np.className = 'detail-name';
        np.textContent = displayName + (displayHline ? ` — ${displayHline}` : '');
        detail.appendChild(np);
      }
      if (longDesc) {
        const dp = document.createElement('p');
        dp.className = 'detail-long-desc';
        dp.textContent = longDesc;
        detail.appendChild(dp);
      }
      if (contact) {
        const a = document.createElement('a');
        a.className = 'inline-contact-link';
        a.href = contact;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.innerHTML = 'Contact &nbsp;→';
        detail.appendChild(a);
      }

      response.appendChild(detail);

      if (outroLines.length) {
        const op = document.createElement('p');
        op.textContent = outroLines.join(' ');
        response.appendChild(op);
      }

      appendAI(resWrap, response);
      return;
    }

    /* ── CASE 2: Profile cards ── */
    const profileBlocks = fullText.match(/Name:[\s\S]*?(?=(?:\n\n|$))/g) || [];

    if (profileBlocks.length > 0) {
      const introText = fullText.split('Name:')[0].trim();
      const lastBlock = profileBlocks[profileBlocks.length - 1];
      const afterBlock = fullText.substring(fullText.indexOf(lastBlock) + lastBlock.length).trim();
      const outroText = afterBlock.replace(/^\n+/, '').trim();

      if (introText) {
        const p = document.createElement('p');
        p.textContent = introText;
        response.appendChild(p);
      }

      profileBlocks.forEach(block => {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        let name = '', headline = '', skills = '', description = '', contact = '';

        lines.forEach(line => {
          if (line.startsWith('Name:')) {
            const raw  = line.replace('Name:', '').trim();
            const dash = raw.indexOf(' - ');
            name     = dash !== -1 ? raw.substring(0, dash).trim() : raw;
            headline = dash !== -1 ? raw.substring(dash + 3).trim() : '';
          }
          else if (line.startsWith('Skills:'))            skills      = line.replace('Skills:', '').trim();
          else if (line.startsWith('Short Description:')) description = line.replace('Short Description:', '').trim();
          else if (line.startsWith('Contact:'))           contact     = line.replace('Contact:', '').replace(/[\[\]]/g, '').trim();
        });

        response.appendChild(buildExpertCard(name, headline, skills, description, contact));
      });

      if (outroText) {
        const p = document.createElement('p');
        p.textContent = outroText;
        response.appendChild(p);
      }

      appendAI(resWrap, response);
      return;
    }

    /* ── CASE 3: Plain text ── */
    const p = document.createElement('p');
    p.textContent = fullText;
    response.appendChild(p);
    appendAI(resWrap, response);
  })
  .catch(err => {
    hideTyping();
    setLoading(false);
    console.error('Error:', err);

    const { resWrap, response } = createAIWrapper();
    const errMsg = document.createElement('p');
    errMsg.textContent = '⚠️ Could not reach the server. Please try again.';
    errMsg.style.color = '#c0392b';
    response.appendChild(errMsg);
    appendAI(resWrap, response);

    // Trigger a health check right away
    checkHealth();
  });
}

searchBtn.onclick = () => handleSubmit();
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSubmit();
});