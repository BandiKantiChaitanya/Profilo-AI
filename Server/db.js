import pg from 'pg'
import dotenv from 'dotenv';
const {Pool}=pg
dotenv.config()

export const pool=new Pool({
    connectionString:process.env.DATABASE_URL,
    // ssl:false,
    ssl: { rejectUnauthorized: false },
})

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});