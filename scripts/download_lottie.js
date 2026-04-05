const https = require('https');
const fs = require('fs');

const options = {
  hostname: 'assets5.lottiefiles.com',
  path: '/packages/lf20_6R6Y9y.json',
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': '*/*;'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 304) {
      fs.mkdirSync('./assets/animations', { recursive: true });
      fs.writeFileSync('./assets/animations/globe.json', data);
      console.log('SUCCESS');
    } else {
      console.log('FAIL: ' + res.statusCode);
      console.log(data);
    }
  });
});
req.on('error', (e) => console.log('ERROR: ' + e));
req.end();
