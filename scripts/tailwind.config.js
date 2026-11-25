/** Tailwind para el archivo único: solo las clases usadas en las páginas. */
const path = require('node:path');
const root = path.resolve(__dirname, '..');
module.exports = {
  darkMode: 'class',
  content: [path.join(root, 'frontend/**/*.{html,js}'), path.join(root, 'standalone/settings.js')],
  theme: { extend: {} },
};
