// ======================= IMPORTY =======================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const usersDB = require('../db/usersDB');
const loginLogsDB = require('../db/loginLogsDB');

// ======================= KONFIGURACJA BLOKADY LOGOWANIA =======================
const LOGIN_ATTEMPT_LIMIT = 5;
const LOCK_TIME_MINUTES = 3;
const loginAttempts = {}; // lokalna mapa z próbami logowania

// ======================= LOGOWANIE =======================

// GET: Formularz logowania i rejestracji
router.get('/login', (req, res) => {
  res.render('login', {
    loginData: {},
    formData: {}
  });
});

// POST: Obsługa logowania użytkownika
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Walidacja pól
  if (!username || !password) {
    loginLogsDB.insert({ username, success: false, reason: 'Wrong login or Password', time: new Date().toISOString() });
    return res.render('login', {
      errorMessage: 'Enter login and password',
      loginData: { username }
    });
  }

  // Sprawdzenie blokady logowania
  const attempt = loginAttempts[username];
  const now = Date.now();
  if (attempt && attempt.count >= LOGIN_ATTEMPT_LIMIT && now - attempt.time < LOCK_TIME_MINUTES * 60 * 1000) {
    return res.render('login', {
      errorMessage: 'Too many failed attempts. Please try again in 3 minutes.',
      loginData: { username }
    });
  }

  // Szukanie użytkownika w bazie
  usersDB.findOne({ username }, (err, user) => {
    if (err || !user) {
      loginLogsDB.insert({ username, success: false, reason: 'Wrong login', time: new Date().toISOString() });
      return res.render('login', {
        errorMessage: 'Incorrect username or password.',
        loginData: { username }
      });
    }

    // Porównanie hasła
    bcrypt.compare(password, user.password, (err, match) => {
      if (!match) {
        loginLogsDB.insert({ username, success: false, reason: 'Wrong password', time: new Date().toISOString() });

        // Liczenie prób nieudanego logowania
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

        // Zalogowano pomyślnie – reset liczników
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

        // Przekierowanie zależnie od roli
        if (user.role === 'admin') return res.redirect('/admin');
        if (user.role === 'organiser') return res.redirect('/organiser');
        return res.redirect('/dashboard');
    });
  });
});

// ======================= REJESTRACJA =======================

// POST: Obsługa rejestracji nowego użytkownika
router.post('/register', (req, res) => {
  const { firstName, lastName, username, password, phone, email } = req.body;

  // Sprawdzenie, czy wszystkie pola są wypełnione
  if (!firstName || !lastName || !username || !password || !phone || !email) {
    return res.render('login', {
      errorMessage: 'All fields are required.',
      formData: { firstName, lastName, username, phone, email }
    });
  }

  // Sprawdzenie unikalności loginu
  usersDB.findOne({ username }, (err, existingUser) => {
    if (existingUser) {
      return res.render('login', {
        errorMessage: 'Username is already in use',
        formData: { firstName, lastName, username, phone, email }
      });
    }

    // Haszowanie hasła i zapis nowego użytkownika
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
        verified: true // na przyszłość – do weryfikacji mailowej
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

// ======================= WYLOGOWANIE =======================

// GET: Wylogowanie użytkownika
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// ======================= EXPORT ROUTERA =======================
module.exports = router;
