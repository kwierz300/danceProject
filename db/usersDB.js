// db/usersDB.js

const Datastore = require('@seald-io/nedb');
const bcrypt = require('bcryptjs');

// Initialize the users database
const usersDB = new Datastore({ filename: 'db/users.db', autoload: true });

// Create the default admin account if it doesn't exist
usersDB.findOne({ username: 'admin' }, (err, existingAdmin) => {
  if (err) {
    return console.error('Error reading users database:', err);
  }

  if (!existingAdmin) {
    const adminPassword = 'Admin123!'; // Strong password matching validation rules

    bcrypt.hash(adminPassword, 10, (err, hashedPassword) => {
      if (err) {
        return console.error('Error hashing admin password:', err);
      }

      const adminUser = {
        firstName: 'Admin',
        lastName: 'Main',
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        email: 'admin@example.com',
        phone: '000000000',
        verified: true
      };

      usersDB.insert(adminUser, (err) => {
        if (!err) {
          console.log('Admin account created (login: admin, password: Admin123!) — please change the password after first login');
        } else {
          console.error('Error creating admin account:', err);
        }
      });
    });
  }
});

// Export the database instance
module.exports = usersDB;
