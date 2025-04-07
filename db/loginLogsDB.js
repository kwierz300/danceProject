// db/loginLogsDB.js

const Datastore = require('@seald-io/nedb');

const loginLogsDB = new Datastore({ filename: 'db/login-logs.db', autoload: true });

module.exports = loginLogsDB;
