const axios = require('axios');
async function check() {
    try {
        const res = await axios.get('http://localhost:3001/');
        console.log('Root Response:', res.data);
    } catch (err) {
        console.error('ERROR (root):', err.message);
    }
}
check();
