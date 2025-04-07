// ======================= IMPORTY =======================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const usersDB = require('../db/usersDB');
const { t } = require('../translations');

// ======================= PANEL ADMINA =======================

// GET: Panel administratora – lista użytkowników z sortowaniem i filtrowaniem
router.get('/', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('<h2>Brak dostępu</h2>');
  }

  const searchQuery = req.query.lastName?.trim()?.toLowerCase();
  const sortBy = req.query.sortBy || 'lastName';
  const order = req.query.order === 'desc' ? -1 : 1;
  const errorMessage = req.query.error;
  const successMessage = req.query.success;

  usersDB.find({}, (err, allUsers) => {
    if (err) return res.send('Błąd pobierania danych.');

    let filteredUsers = searchQuery
      ? allUsers.filter(u => u.lastName?.toLowerCase().includes(searchQuery))
      : allUsers;

    // Sortowanie według wybranego pola
    filteredUsers.sort((a, b) => {
      const valA = (a[sortBy] || '').toLowerCase();
      const valB = (b[sortBy] || '').toLowerCase();
      if (valA < valB) return -1 * order;
      if (valA > valB) return 1 * order;
      return 0;
    });

    // Podział na role
    const admins = filteredUsers.filter(u => u.role === 'admin');
    const organisers = filteredUsers.filter(u => u.role === 'organiser');
    const users = filteredUsers.filter(u => u.role === 'user');

    // Dodatkowe flagi dla przycisków w widoku
    [admins, organisers, users].forEach(group => {
      group.forEach(u => {
        u.isAdmin = u.role === 'admin';
        u.canBePromoted = u.role === 'organiser';
        u.canBeDemoted = u.role === 'admin' && u.username !== req.session.user.username;
        u.isSelf = u.username === req.session.user.username;
      });
    });

    res.render('admin', {
      username: req.session.user.username,
      admins: admins.map(u => ({ ...u })),
      organisers: organisers.map(u => ({ ...u })),
      users: users.map(u => ({ ...u })),
      searchQuery,
      isSortedByFirstName: sortBy === 'firstName',
      isSortedByLastName: sortBy === 'lastName',
      isSortedByUsername: sortBy === 'username',
      sortArrow: order === 1 ? ' ↑' : ' ↓',
      nextOrder: order === 1 ? 'desc' : 'asc',
      errorMessage,
      successMessage
    });
    
  });
});

// ======================= EDYCJA DANYCH UŻYTKOWNIKA =======================

// GET: Formularz edycji danych użytkownika
router.get('/edit/:id', (req, res) => {
  const userId = req.params.id;

  usersDB.findOne({ _id: userId }, (err, user) => {
    if (err || !user) {
      return res.status(404).send(t(req, 'User not found')); // też z tłumaczeniem
    }

    res.render('editUser', {
      title: t(req, 'Edit user'),
      user
    });
  });
});

// POST: Zapisanie edytowanych danych użytkownika (w tym loginu)
router.post('/edit/:id', (req, res) => {
  const userId = req.params.id;
  const { firstName, lastName, email, phone, username } = req.body;

  if (!firstName || !lastName || !email || !phone || !username) {
    return res.redirect('/admin?error=Wszystkie+pola+muszą+być+uzupełnione.');
  }

  // Sprawdzenie czy login nie jest już zajęty przez innego użytkownika
  usersDB.findOne({ username }, (err, existingUser) => {
    if (err) return res.redirect('/admin?error=Błąd+bazy+danych.');

    // Jeśli login jest już używany przez kogoś innego – błąd
    if (existingUser && existingUser._id !== userId) {
      return res.render('editUser', {
        title: t(req, 'Edit user'),
        errorMessage: t(req, 'This username is already taken.'),
        formData: { firstName, lastName, email, phone, username },
        user: { _id: userId } // potrzebne do /edit/{{user._id}}
      });
    }
    

    // Aktualizacja danych użytkownika
    usersDB.update(
      { _id: userId },
      { $set: { firstName, lastName, email, phone, username } },
      {},
      (err, numReplaced) => {
        if (err || numReplaced === 0) {
          return res.render('editUser', {
            title: t(req, 'Edit user'),
            errorMessage: t(req, 'Failed to update user data.'),
            formData: { firstName, lastName, email, phone, username },
            user: { _id: userId }
          });
        }
    
        res.redirect(`/admin?success=${encodeURIComponent(t(req, 'User data updated successfully.'))}`);
      }
    );
    
  });
});

// ======================= ZARZĄDZANIE ROLAMI =======================

// POST: Zmiana roli user ⇄ organiser
router.post('/toggle-role/:id', (req, res) => {
  const userId = req.params.id;

  usersDB.findOne({ _id: userId }, (err, user) => {
    if (!user || user.role === 'admin') {
      return res.redirect('/admin?error=Nie+można+zmienić+roli+administratora.');
    }

    const newRole = user.role === 'user' ? 'organiser' : 'user';

    usersDB.update({ _id: userId }, { $set: { role: newRole } }, {}, (err) => {
      return res.redirect('/admin?success=Rola+użytkownika+została+zmieniona.');
    });
  });
});

// ======================= USUWANIE UŻYTKOWNIKÓW =======================

// POST: Usuwanie użytkownika (poza adminem)
router.post('/delete/:id', (req, res) => {
  const userId = req.params.id;

  usersDB.findOne({ _id: userId }, (err, user) => {
    if (!user || user.role === 'admin') {
      return res.redirect('/admin?error=Nie+można+usunąć+administratora.');
    }

    usersDB.remove({ _id: userId }, {}, (err, numRemoved) => {
      return res.redirect('/admin?success=Użytkownik+został+usunięty.');
    });
  });
});

// ======================= AWANS I DEGRADACJA ADMINÓW =======================

// POST: Awans na administratora (z hasłem admina)
router.post('/make-admin/:id', (req, res) => {
  const userId = req.params.id;
  const confirmPassword = req.body.confirmPassword;

  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Brak dostępu.');
  }

  usersDB.findOne({ username: req.session.user.username }, (err, adminUser) => {
    if (!adminUser) return res.send('Błąd autoryzacji.');

    bcrypt.compare(confirmPassword, adminUser.password, (err, match) => {
      if (!match) {
        return res.redirect('/admin?error=Błędne+hasło+–+nie+udało+się+awansować+użytkownika.');
      }

      usersDB.update({ _id: userId }, { $set: { role: 'admin' } }, {}, () => {
        return res.redirect('/admin?success=Użytkownik+awansowany+na+administratora.');
      });
    });
  });
});

// POST: Degradacja administratora do roli organiser (z hasłem admina)
router.post('/demote/:id', (req, res) => {
  const userId = req.params.id;
  const confirmPassword = req.body.confirmPassword;

  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Brak dostępu.');
  }

  usersDB.findOne({ username: req.session.user.username }, (err, adminUser) => {
    if (!adminUser) return res.redirect('/admin');

    bcrypt.compare(confirmPassword, adminUser.password, (err, match) => {
      if (!match) {
        return res.redirect('/admin?error=Błędne+hasło+–+nie+udało+się+zdegradować+administratora.');
      }

      usersDB.findOne({ _id: userId }, (err, user) => {
        if (!user || user.role !== 'admin' || user.username === req.session.user.username) {
          return res.redirect('/admin?error=Nie+można+zdegradować+tego+użytkownika.');
        }

        usersDB.update({ _id: userId }, { $set: { role: 'organiser' } }, {}, () => {
          return res.redirect('/admin?success=Administrator+został+zdegradowany.');
        });
      });
    });
  });
});

// ======================= RESETOWANIE HASŁA =======================

// POST: Reset hasła przez admina (w tym własnego z potwierdzeniem)
router.post('/reset-password/:id', (req, res) => {
  const userId = req.params.id;
  const newPassword = req.body.newPassword;
  const confirmPassword = req.body.confirmPassword;

  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Brak dostępu.');
  }

  if (!newPassword || newPassword.length < 8) {
    return res.redirect('/admin?error=Nowe+hasło+jest+za+krótkie.');
  }

  usersDB.findOne({ _id: userId }, (err, targetUser) => {
    if (!targetUser) return res.redirect('/admin');

    const isSelf = targetUser.username === req.session.user.username;

    if (isSelf) {
      usersDB.findOne({ username: req.session.user.username }, (err, adminUser) => {
        if (!adminUser) return res.redirect('/admin');

        bcrypt.compare(confirmPassword, adminUser.password, (err, match) => {
          if (!match) {
            return res.redirect('/admin?error=Błędne+hasło+administratora+–+nie+można+zresetować+własnego+hasła.');
          }

          bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
            usersDB.update({ _id: userId }, { $set: { password: hashedPassword } }, {}, () => {
              return res.redirect('/admin?success=Hasło+zostało+zmienione.');
            });
          });
        });
      });
    } else {
      bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
        usersDB.update({ _id: userId }, { $set: { password: hashedPassword } }, {}, () => {
          return res.redirect('/admin?success=Hasło+użytkownika+zostało+zresetowane.');
        });
      });
    }
  });
});

// ======================= EXPORT =======================
module.exports = router;
