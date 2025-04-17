// db/coursesDB.js

// Import the NeDB database module
const Datastore = require('@seald-io/nedb'); 

// Import Node.js module for handling file paths
const path = require('path');

// Initialize the database for courses
// The database will be stored in a file called 'courses.db' inside the current directory
const db = new Datastore({
  filename: path.join(__dirname, 'courses.db'), // Full path to the database file
  autoload: true // Automatically loads the database when the app starts
});

// Export the database instance to be used in other parts of the application
module.exports = db;
