const axios = require('axios');
async function check() {
    try {
        const res = await axios.get('http://localhost:3001/api/bot/health'); // Guessing another one or using the root
        console.log('Bot Response:', JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error('ERROR (bot):', err.message);
    }
}
check();
