const express = require('express');
const router = express.Router();
const { t } = require('../translations');

// GET /contact – display contact form
router.get('/', (req, res) => {
  res.render('contact', {
    title: 'Kontakt'
  });
});

// POST /contact – handle form submission
router.post('/', (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    const errorMsg = t(req, "Please fill in all fields");
    return res.redirect(`/contact?error=${encodeURIComponent(errorMsg)}`);
  }

  // Here you could save the data to the database or send an email
  console.log('New message received:', { name, email, message });

  const successMsg = t(req, "Message sent successfully");
  res.redirect(`/contact?success=${encodeURIComponent(successMsg)}`);
});

module.exports = router;
