const express = require('express');
const router = express.Router();
const { t } = require('../translations');

// GET /contact – wyświetlenie formularza kontaktowego
router.get('/', (req, res) => {
  res.render('contact', {
    title: 'Kontakt'
  });
});


// POST /contact – obsługa formularza
router.post('/', (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    const errorMsg = t(req, "Please fill in all fields");
    return res.redirect(`/contact?error=${encodeURIComponent(errorMsg)}`);
  }

  // Można tu zapisać dane do bazy lub wysłać e-mail
  console.log('Nowa wiadomość:', { name, email, message });

  const successMsg = t(req, "Message sent successfully");
  res.redirect(`/contact?success=${encodeURIComponent(successMsg)}`);
});

module.exports = router;
