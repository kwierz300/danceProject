//  IMPORTS 
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const usersDB = require('../db/usersDB');
const loginLogsDB = require('../db/loginLogsDB');

//  LOGIN ATTEMPT LIMIT CONFIG 
const LOGIN_ATTEMPT_LIMIT = 5;
const LOCK_TIME_MINUTES = 3;
const loginAttempts = {}; 

//  LOGIN 

// GET: Login and registration form
router.get('/login', (req, res) => {
  res.render('login', {
    loginData: {},
    formData: {}
  });
});

// POST: Handle user login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Field validation
  if (!username || !password) {
    loginLogsDB.insert({ username, success: false, reason: 'Wrong login or Password', time: new Date().toISOString() });
    return res.render('login', {
      errorMessage: 'Enter login and password',
      loginData: { username }
    });
  }

  // Check login lock
  const attempt = loginAttempts[username];
  const now = Date.now();
  if (attempt && attempt.count >= LOGIN_ATTEMPT_LIMIT && now - attempt.time < LOCK_TIME_MINUTES * 60 * 1000) {
    return res.render('login', {
      errorMessage: 'Too many failed attempts. Please try again in 3 minutes.',
      loginData: { username }
    });
  }

  // Find user in database
  usersDB.findOne({ username }, (err, user) => {
    if (err || !user) {
      loginLogsDB.insert({ username, success: false, reason: 'Wrong login', time: new Date().toISOString() });
      return res.render('login', {
        errorMessage: 'Incorrect username or password.',
        loginData: { username }
      });
    }

    // Compare password
    bcrypt.compare(password, user.password, (err, match) => {
      if (!match) {
        loginLogsDB.insert({ username, success: false, reason: 'Wrong password', time: new Date().toISOString() });

        // Track failed login attempts
        if (!loginAttempts[username]) {
          loginAttempts[username] = { count: 1, time: now };
        } else {
          loginAttempts[username].count++;
          loginAttempts[username].time = now;
        }

        const attemptsLeft = LOGIN_ATTEMPT_LIMIT - loginAttempts[username].count;
        const message = attemptsLeft <= 0
          ? 'Too many failed attempts. Please try again in 3 minutes.'
          : `Invalid login details. Remaining attempts: ${attemptsLeft}`;

        return res.render('login', {
          errorMessage: message,
          loginData: { username }
        });
      }

      // Successful login – reset attempt counter
      delete loginAttempts[username];

      req.session.user = {
        _id: user._id,
        username: user.username,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone
      };

      loginLogsDB.insert({ username, success: true, time: new Date().toISOString() });

      // Redirect based on user role
      if (user.role === 'admin') return res.redirect('/admin');
      if (user.role === 'organiser') return res.redirect('/organiser');
      return res.redirect('/dashboard');
    });
  });
});

//  REGISTRATION 

// POST: Handle user registration
router.post('/register', (req, res) => {
  const { firstName, lastName, username, password, phone, email } = req.body;

  // Check if all fields are filled
  if (!firstName || !lastName || !username || !password || !phone || !email) {
    return res.render('login', {
      errorMessage: 'All fields are required.',
      formData: { firstName, lastName, username, phone, email }
    });
  }

  // Check if username is already taken
  usersDB.findOne({ username }, (err, existingUser) => {
    if (existingUser) {
      return res.render('login', {
        errorMessage: 'Username is already in use',
        formData: { firstName, lastName, username, phone, email }
      });
    }

    // Hash password and save new user
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) return res.send('Error creating account.');

      const newUser = {
        firstName,
        lastName,
        username,
        password: hashedPassword,
        phone,
        email,
        role: 'user',
        verified: true // reserved for future email verification
      };

      usersDB.insert(newUser, (err, insertedUser) => {
        if (err) return res.send('User save error.');

        req.session.user = {
          username: insertedUser.username,
          role: insertedUser.role
        };

        res.redirect('/dashboard');
      });
    });
  });
});

//  LOGOUT 

// GET: Log out the user
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

//  EXPORT ROUTER 
module.exports = router;
