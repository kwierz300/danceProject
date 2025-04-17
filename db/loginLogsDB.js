// db/loginLogsDB.js

// Import database module
const Datastore = require('@seald-io/nedb');

// Set up the login logs database
const loginLogsDB = new Datastore({ 
  filename: 'db/login-logs.db',
  autoload: true
});

// Export the database instance
module.exports = loginLogsDB;
