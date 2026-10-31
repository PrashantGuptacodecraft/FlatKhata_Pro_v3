'use strict';

const { Client } = require('pg');
const url = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_T8V0pXlAzSKv@ep-summer-breeze-azxjvixy-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

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
