const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkProfiles() {
    try {
        const { data, error } = await supabase.from('profiles').select('email, organization_id, organizations(name)').limit(10);
        if (error) {
            console.error('PROFILES ERROR:', error.message);
        } else {
            console.log('PROFILES:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('FATAL:', err.message);
    }
}
checkProfiles();
