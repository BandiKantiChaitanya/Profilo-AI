import { pool } from './db.js';
import { spawn } from 'child_process';
import fs from 'fs';

/* ---------- EMBEDDING ---------- */
function getEmbedding(text) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', ['embed.py', text]);

    let data = '';
    let error = '';

    py.stdout.on('data', chunk => data += chunk);
    py.stderr.on('data', err => error += err);

    py.on('close', code => {
      if (code !== 0) return reject(error);
      resolve(JSON.parse(data));
    //   console.log(data)
    });
  });
}

function readCSV(path) {
  const content = fs.readFileSync(path, "utf8")
    .replace(/\r/g, "")
    .trim();

  const lines = content.split("\n");

  const firstLine = lines[0].replace(/^\uFEFF/, "").trim();

  // ✅ Auto-detect tab vs comma
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const headers = firstLine.split(delimiter);

  const rows = lines.slice(1).map(line => {
    const values = line.split(delimiter);
    const rowObj = {};
    headers.forEach((header, i) => {
      rowObj[header.trim()] = values[i]?.trim();
    });
    return rowObj;
  });

  return rows;
}


// /* ---------- SAMPLE DATA ---------- */
// const profiles = [
//   {
//     name: 'Rahul',
//     headline: 'Backend Developer',
//     short_description: 'Node.js developer focused on AI-powered job referrals.',
//     long_description:
//       'Backend developer with 2 years of MERN experience building RAG-based recommendation systems.',
//     skills: 'Node.js, Express, SQL, Python, RAG',
//     contact: 'https://linkedin.com/in/rahul'
//   }
// ];



/* ---------- SIMPLE INSERT ---------- */
async function populate_db() {
   const profiles = await readCSV('./profiles.csv');
  for (const p of profiles) {
    // 1️⃣ Generate embedding first
    const textToEmbed = `
Headline: ${p.headline}
Short: ${p.short_description}
Long: ${p.long_description}
Skills: ${p.skills}
    `;
    const embedding = await getEmbedding(textToEmbed);

    // 2️⃣ Insert all fields INCLUDING embedding
    await pool.query(
      `
      INSERT INTO profiles
      (name, headline, short_description, long_description, skills, contact, embedding)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        p.name,
        p.headline,
        p.short_description,
        p.long_description,
        p.skills,
        p.contact,
        JSON.stringify(embedding) // store vector here
      ]
    );

    console.log(`Inserted & embedded: ${p.name}`);
  }

  await pool.end();
  console.log('Done!');
}

populate_db().catch(console.error);
