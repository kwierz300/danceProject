const express = require('express');
const router = express.Router();

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
    return res.redirect('/contact?error=Proszę uzupełnić wszystkie pola.');
  }

  // Można tu zapisać dane do bazy lub wysłać e-mail
  console.log('Nowa wiadomość:', { name, email, message });

  res.redirect('/contact?success=Wiadomość została wysłana pomyślnie!');
});

module.exports = router;
