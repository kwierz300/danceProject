// db/usersDB.js

const Datastore = require('@seald-io/nedb');
const bcrypt = require('bcryptjs');

const usersDB = new Datastore({ filename: 'db/users.db', autoload: true });

/**
 * ✅ Jednorazowe tworzenie konta administratora (jeśli nie istnieje)
 * Hasło spełnia wymagania: min. 8 znaków, wielka i mała litera, cyfra, znak specjalny
 * Login: admin | Hasło: Admin123!
 */
usersDB.findOne({ username: 'admin' }, (err, existingAdmin) => {
  if (err) {
    return console.error('❌ Błąd odczytu bazy użytkowników:', err);
  }

  if (!existingAdmin) {
    const adminPassword = 'Admin123!'; // Silne hasło (zgodne z walidacją)

    bcrypt.hash(adminPassword, 10, (err, hashedPassword) => {
      if (err) {
        return console.error('❌ Błąd przy haszowaniu hasła admina:', err);
      }

      const adminUser = {
        firstName: 'Admin',
        lastName: 'Główny',
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        email: 'admin@example.com',
        phone: '000000000',
        verified: true
      };

      usersDB.insert(adminUser, (err) => {
        if (!err) {
          console.log('✔️ Konto administratora utworzone (admin Admin123! — zmień hasło po pierwszym logowaniu)');
        } else {
          console.error('❌ Błąd przy zapisie konta administratora:', err);
        }
      });
    });
  }
});

module.exports = usersDB;
