'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[db] Error: DATABASE_URL environment variable is required.');
  process.exit(1);
}

async function inspect() {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const tables = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('=== Tables in Neon PostgreSQL ===');
  for (const t of tables.rows) {
    console.log(`\nTable: ${t.table_name}`);
    const cols = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position;
    `, [t.table_name]);
    cols.rows.forEach(c => {
      console.log(`  - ${c.column_name.padEnd(20)} ${c.data_type.padEnd(25)} nullable: ${c.is_nullable} default: ${c.column_default || ''}`);
    });
  }

  await client.end();
}

inspect().catch(console.error);
