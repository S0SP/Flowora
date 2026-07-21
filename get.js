const { Client } = require('pg');
const fs = require('fs');

const connectionString = "postgresql://postgres:Sumit700%4032@db.kgdlmgtslhjpytncxwzw.supabase.co:5432/postgres";
const client = new Client({ connectionString });

async function extractFullSchema() {
    try {
        await client.connect();
        console.log("Connected to Supabase successfully...");

        let sqlOutput = "-- Generated Schema Migrations, Relations & Subscriptions --\n\n";

        // 1. EXTRACT TABLES AND COLUMNS
        console.log("Extracting tables...");
        const tableRes = await client.query(`
      SELECT t.table_name,
             string_agg('    ' || quote_ident(c.column_name) || ' ' || c.data_type || 
                        CASE WHEN c.character_maximum_length IS NOT NULL THEN '(' || c.character_maximum_length || ')' ELSE '' END || 
                        CASE WHEN c.is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END, ',\n' ORDER BY c.ordinal_position) as columns
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      GROUP BY t.table_name;
    `);

        tableRes.rows.forEach(row => {
            sqlOutput += `CREATE TABLE public.${row.table_name} (\n${row.columns}\n);\n\n`;
        });

        // 2. EXTRACT ENTITY RELATIONS (FOREIGN KEYS)
        console.log("Extracting entity relationships...");
        const fkRes = await client.query(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public';
    `);

        if (fkRes.rows.length > 0) {
            sqlOutput += "-- Entity Relations (Foreign Keys) --\n";
            fkRes.rows.forEach(row => {
                sqlOutput += `ALTER TABLE public.${row.table_name} ADD CONSTRAINT fk_${row.table_name}_${row.column_name} FOREIGN KEY (${row.column_name}) REFERENCES public.${row.foreign_table_name}(${row.foreign_column_name});\n`;
            });
            sqlOutput += "\n";
        }

        // 3. EXTRACT CUSTOM DATABASE TRIGGERS
        console.log("Extracting database triggers...");
        const triggerRes = await client.query(`
      SELECT trigger_name, event_manipulation, event_object_table, action_statement, action_timing
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public';
    `);

        if (triggerRes.rows.length > 0) {
            sqlOutput += "-- Custom Database Triggers --\n";
            triggerRes.rows.forEach(row => {
                sqlOutput += `CREATE TRIGGER ${row.trigger_name} ${row.action_timing} ${row.event_manipulation} ON public.${row.event_object_table} FOR EACH ROW ${row.action_statement};\n`;
            });
            sqlOutput += "\n";
        }

        // 4. EXTRACT SUPABASE REALTIME CONFIGURATION
        console.log("Extracting realtime subscriptions...");
        try {
            const pubRes = await client.query(`
        SELECT schemaname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
      `);

            if (pubRes.rows.length > 0) {
                sqlOutput += "-- Supabase Realtime Stream Replications --\n";
                sqlOutput += "CREATE PUBLICATION supabase_realtime;\n";
                pubRes.rows.forEach(row => {
                    sqlOutput += `ALTER PUBLICATION supabase_realtime ADD TABLE ${row.schemaname}.${row.tablename};\n`;
                });
            }
        } catch (pubErr) {
            sqlOutput += "-- Note: No 'supabase_realtime' publication found or accessible.\n";
        }

        fs.writeFileSync('raw_schema.sql', sqlOutput);
        console.log("Done! Everything is saved in 'raw_schema.sql'.");

    } catch (err) {
        console.error("Error executing extraction:", err.message);
    } finally {
        await client.end();
    }
}

extractFullSchema();
