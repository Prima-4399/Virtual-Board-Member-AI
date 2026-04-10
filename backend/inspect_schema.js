const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
    try {
        const { data, error } = await supabase.from('meetings').select('*').limit(0);
        if (error) {
            console.error('SCHEMA ERROR:', error.message);
        } else {
            console.log('Columns found:', Object.keys(data || {}));
        }
        
        // Try to query INFORMATION_SCHEMA if possible (permission dependent)
        const { data: cols, error: colError } = await supabase.rpc('inspect_table_columns', { table_name: 'meetings' });
        if (colError) {
             console.error('RPC inspect failed:', colError.message);
        } else {
             console.log('Columns from RPC:', cols);
        }
    } catch (err) {
        console.error('FATAL:', err.message);
    }
}
checkSchema();
