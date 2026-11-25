'use strict';
// En el navegador la base la crea standalone/main.js (sql.js); node:sqlite no existe.
module.exports = {
  getDb() { throw new Error('getDb no disponible en el navegador: usar services.setRepos()'); },
  setDb() {},
  Database: class {},
};
