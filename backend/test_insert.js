const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testInsert() {
    try {
        const { data, error } = await supabase.from('meetings').insert({
            id: uuidv4(),
            title: 'TEST ROW ' + new Date().toISOString(),
            recall_bot_id: 'test-' + Date.now()
        }).select();
        
        if (error) {
            console.error('INSERT ERROR:', JSON.stringify(error, null, 2));
        } else {
            console.log('INSERT SUCCESS:', JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('FATAL:', err.message);
    }
}
testInsert();
