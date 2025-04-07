// db/coursesDB.js
const Datastore = require('@seald-io/nedb'); // ✅ Nowoczesna wersja

const path = require('path');

// Ścieżka do pliku z kursami
const db = new Datastore({
  filename: path.join(__dirname, 'courses.db'),
  autoload: true
});

module.exports = db;
