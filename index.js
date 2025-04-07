// ------------------- IMPORTS & CONFIGURATION ------------------- //
const express = require('express');
const mustacheExpress = require('mustache-express');
const path = require('path');
const session = require('express-session');
const app = express();
const PORT = process.env.PORT || 3000;

// Import route files
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const organiserRoutes = require('./routes/organiser');
const userRoutes = require('./routes/user');
const coursesRoutes = require('./routes/courses');
const contactRoutes = require('./routes/contact');


// Import translation dictionary (to be created later)
const translations = require('./translations'); 

// ------------------- MIDDLEWARE ------------------- //

// Parse form data
app.use(express.urlencoded({ extended: true }));

// Serve static files (e.g., CSS, JS, images)
app.use(express.static('public'));

// Configure session for login tracking and language preference
app.use(session({
  secret: 'tajnyKod123',
  resave: false,
  saveUninitialized: true,
  unset: 'destroy',
  cookie: { sameSite: 'lax' }
}));

// Template engine configuration
app.engine('mustache', mustacheExpress(path.join(__dirname, 'views', 'partials')));
app.set('view engine', 'mustache');
app.set('views', path.join(__dirname, 'views'));

// ------------------- LANGUAGE HANDLER ------------------- //

// Set default language to English and provide translation function
app.use((req, res, next) => {
  if (!req.session.language) {
    req.session.language = 'en';
  }

  res.locals.language = req.session.language;

  // ✅ Translation function available in all templates
  res.locals.t = function () {
    return function (text, render) {
      const key = render(text);
      return translations[key]?.[req.session.language] || key;
    };
  };

  next();
});


// ------------------- GLOBAL TEMPLATE VARIABLES ------------------- //
app.use((req, res, next) => {
  const user = req.session.user;

  // Session info for conditional rendering
  res.locals.sessionUser = user;
  res.locals.username = user?.username;
  res.locals.isAdmin = user?.role === 'admin';
  res.locals.isOrganiser = user?.role === 'organiser';
  res.locals.isUser = user?.role === 'user';
  
  // Active language flags for navbar buttons
  res.locals.languageIsEnglish = req.session.language === 'en';
  res.locals.languageIsPolish = req.session.language === 'pl';


  // Alert messages
  res.locals.successMessage = req.query.success || null;
  res.locals.errorMessage = req.query.error || null;

  // Active page indicators for navbar
  res.locals.isActiveHome = req.path === '/';
  res.locals.isActiveCourses = req.path.startsWith('/courses');
  res.locals.isActiveLogin = req.path === '/login';
  res.locals.isActiveAdmin = req.path.startsWith('/admin');
  res.locals.isActiveOrganiser = req.path.startsWith('/organiser');
  res.locals.isActiveUser = req.path.startsWith('/dashboard');
  res.locals.isActiveWeekly = req.path === '/courses/weekly';
  res.locals.isActiveOther = req.path === '/courses/other';
  res.locals.isActiveContact = req.path === '/contact';

  res.locals.currentPath = req.path;

  next();
});

// ------------------- ROUTES ------------------- //

app.use('/admin', adminRoutes);
app.use('/', authRoutes);
app.use('/', organiserRoutes);
app.use('/', userRoutes);
app.use('/', coursesRoutes);
app.use('/contact', contactRoutes);

// ------------------- HOME PAGE ------------------- //

app.get('/', (req, res) => {
  res.render('home', {
    title: 'Welcome to the Dance Course Booking System', // ✅ Default in English
    username: req.session.user?.username
  });
});

app.post('/change-language', (req, res) => {
  const lang = req.body.lang;
  if (['en', 'pl'].includes(lang)) {
    req.session.language = lang;
  }

  res.redirect(req.get('Referrer') || '/');
});



// ------------------- SERVER START ------------------- //
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
