'use strict';
const http = require('node:http');
http.get('http://127.0.0.1:3000/api/health', (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => { console.log(data); process.exit(res.statusCode === 200 ? 0 : 1); });
}).on('error', (e) => { console.error(e.message); process.exit(1); });