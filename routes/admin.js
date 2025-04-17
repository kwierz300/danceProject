// ======================= IMPORTS =======================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const usersDB = require('../db/usersDB');
const { t } = require('../translations');

// ======================= ADMIN PANEL =======================

// GET: Admin panel – list of users with sorting and filtering
router.get('/', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('<h2>Access denied</h2>');
  }

  const searchQuery = req.query.lastName?.trim()?.toLowerCase();
  const sortBy = req.query.sortBy || 'lastName';
  const order = req.query.order === 'desc' ? -1 : 1;
  const errorMessage = req.query.error;
  const successMessage = req.query.success;

  usersDB.find({}, (err, allUsers) => {
    if (err) return res.send('Error fetching data.');

    let filteredUsers = searchQuery
      ? allUsers.filter(u => u.lastName?.toLowerCase().includes(searchQuery))
      : allUsers;

    // Sorting by selected field
    filteredUsers.sort((a, b) => {
      const valA = (a[sortBy] || '').toLowerCase();
      const valB = (b[sortBy] || '').toLowerCase();
      if (valA < valB) return -1 * order;
      if (valA > valB) return 1 * order;
      return 0;
    });

    // Role-based grouping
    const admins = filteredUsers.filter(u => u.role === 'admin');
    const organisers = filteredUsers.filter(u => u.role === 'organiser');
    const users = filteredUsers.filter(u => u.role === 'user');

    // Flags for buttons in the view
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

// ======================= USER DATA EDITING =======================

// GET: Edit user form
router.get('/edit/:id', (req, res) => {
  const userId = req.params.id;

  usersDB.findOne({ _id: userId }, (err, user) => {
    if (err || !user) {
      return res.status(404).send(t(req, 'User not found'));
    }

    res.render('editUser', {
      title: t(req, 'Edit user'),
      user
    });
  });
});

// POST: Save updated user data
router.post('/edit/:id', (req, res) => {
  const userId = req.params.id;
  const { firstName, lastName, email, phone, username } = req.body;

  if (!firstName || !lastName || !email || !phone || !username) {
    return res.redirect('/admin?error=All+fields+are+required.');
  }

  // Check if username is already taken by another user
  usersDB.findOne({ username }, (err, existingUser) => {
    if (err) return res.redirect('/admin?error=Database+error.');

    if (existingUser && existingUser._id !== userId) {
      return res.render('editUser', {
        title: t(req, 'Edit user'),
        errorMessage: t(req, 'This username is already taken.'),
        formData: { firstName, lastName, email, phone, username },
        user: { _id: userId }
      });
    }

    // Update user data
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

// ======================= ROLE MANAGEMENT =======================

// POST: Toggle user role between 'user' and 'organiser'
router.post('/toggle-role/:id', (req, res) => {
  const userId = req.params.id;

  usersDB.findOne({ _id: userId }, (err, user) => {
    if (!user || user.role === 'admin') {
      return res.redirect('/admin?error=Cannot+change+admin+role.');
    }

    const newRole = user.role === 'user' ? 'organiser' : 'user';

    usersDB.update({ _id: userId }, { $set: { role: newRole } }, {}, (err) => {
      return res.redirect('/admin?success=User+role+updated.');
    });
  });
});

// ======================= USER DELETION =======================

// POST: Delete user (excluding admins)
router.post('/delete/:id', (req, res) => {
  const userId = req.params.id;

  usersDB.findOne({ _id: userId }, (err, user) => {
    if (!user || user.role === 'admin') {
      return res.redirect('/admin?error=Cannot+delete+admin.');
    }

    usersDB.remove({ _id: userId }, {}, (err, numRemoved) => {
      return res.redirect('/admin?success=User+deleted.');
    });
  });
});

// ======================= ADMIN PROMOTION/DEMOTION =======================

// POST: Promote user to admin (requires admin password)
router.post('/make-admin/:id', (req, res) => {
  const userId = req.params.id;
  const confirmPassword = req.body.confirmPassword;

  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied.');
  }

  usersDB.findOne({ username: req.session.user.username }, (err, adminUser) => {
    if (!adminUser) return res.send('Authorization error.');

    bcrypt.compare(confirmPassword, adminUser.password, (err, match) => {
      if (!match) {
        return res.redirect('/admin?error=Incorrect+password+–+promotion+failed.');
      }

      usersDB.update({ _id: userId }, { $set: { role: 'admin' } }, {}, () => {
        return res.redirect('/admin?success=User+promoted+to+admin.');
      });
    });
  });
});

// POST: Demote admin to organiser (requires admin password)
router.post('/demote/:id', (req, res) => {
  const userId = req.params.id;
  const confirmPassword = req.body.confirmPassword;

  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied.');
  }

  usersDB.findOne({ username: req.session.user.username }, (err, adminUser) => {
    if (!adminUser) return res.redirect('/admin');

    bcrypt.compare(confirmPassword, adminUser.password, (err, match) => {
      if (!match) {
        return res.redirect('/admin?error=Incorrect+password+–+demotion+failed.');
      }

      usersDB.findOne({ _id: userId }, (err, user) => {
        if (!user || user.role !== 'admin' || user.username === req.session.user.username) {
          return res.redirect('/admin?error=Cannot+demote+this+user.');
        }

        usersDB.update({ _id: userId }, { $set: { role: 'organiser' } }, {}, () => {
          return res.redirect('/admin?success=Admin+demoted+to+organiser.');
        });
      });
    });
  });
});

// ======================= PASSWORD RESET =======================

// POST: Reset password by admin (including self, with confirmation)
router.post('/reset-password/:id', (req, res) => {
  const userId = req.params.id;
  const newPassword = req.body.newPassword;
  const confirmPassword = req.body.confirmPassword;

  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).send('Access denied.');
  }

  if (!newPassword || newPassword.length < 8) {
    return res.redirect('/admin?error=Password+too+short.');
  }

  usersDB.findOne({ _id: userId }, (err, targetUser) => {
    if (!targetUser) return res.redirect('/admin');

    const isSelf = targetUser.username === req.session.user.username;

    if (isSelf) {
      usersDB.findOne({ username: req.session.user.username }, (err, adminUser) => {
        if (!adminUser) return res.redirect('/admin');

        bcrypt.compare(confirmPassword, adminUser.password, (err, match) => {
          if (!match) {
            return res.redirect('/admin?error=Incorrect+admin+password+–+cannot+reset+own+password.');
          }

          bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
            usersDB.update({ _id: userId }, { $set: { password: hashedPassword } }, {}, () => {
              return res.redirect('/admin?success=Password+updated.');
            });
          });
        });
      });
    } else {
      bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
        usersDB.update({ _id: userId }, { $set: { password: hashedPassword } }, {}, () => {
          return res.redirect('/admin?success=User+password+reset.');
        });
      });
    }
  });
});

// ======================= EXPORT =======================
module.exports = router;
