const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);
async function count() {
    try {
        const { count, error } = await supabase.from('meetings').select('*', { count: 'exact', head: true });
        console.log('Total Meetings Count:', count);
        if (error) console.error('Error fetching count:', error.message);
    } catch (err) {
        console.error('ERROR:', err.message);
    }
}
count();
