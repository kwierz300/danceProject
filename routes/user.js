// routes/user.js
// ---------------------- IMPORTS & CONFIG ---------------------- //
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const usersDB = require('../db/usersDB');
const coursesDB = require('../db/coursesDB'); 

// -------------------- USER DASHBOARD -------------------- //
router.get('/dashboard', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'user') {
    return res.status(403).send('<h2>Access denied</h2>');
  }

  const username = req.session.user.username;

  usersDB.findOne({ username }, (err, user) => {
    if (err || !user) return res.send('Error loading user data');

    coursesDB.find({}, (err, allCourses) => {
      if (err) return res.send('Error loading courses');

      // Fully enrolled courses
      const fullCourses = allCourses
        .filter(c => (c.participants || []).some(p => p.username === username))
        .map(c => ({
          _id: c._id,
          title: c.title,
          courseType: c.courseType,
          style: c.style,
          level: c.level,
          sessions: c.sessions,
        }));

      // Courses with selected sessions
      const partialCourses = [];

      allCourses.forEach(course => {
        const courseTitle = course.title || '[no title]';

        (course.partialParticipants || []).forEach(p => {
          if (p.username === username && Array.isArray(p.selectedDates)) {
            partialCourses.push({
              _id: course._id,
              title: course.title,
              courseType: course.courseType,
              style: course.style,
              level: course.level,
              selectedDates: p.selectedDates
            });
          }
        });
      });

      res.render('dashboard', {
        username: user.username,
        user,
        fullCourses,
        partialCourses
      });
    });
  });
});

// ---------------------- PROFILE DATA UPDATE ---------------------- //
// POST /dashboard/edit – update user profile data
router.post('/dashboard/edit', (req, res) => {
  const { firstName, lastName, username, email, phone } = req.body;
  const currentUser = req.session.user;

  // Validate form fields
  if (!firstName || !lastName || !username || !email || !phone) {
    return res.redirect('/dashboard?error=Please+fill+in+all+fields.');
  }

  // Check if the new username is already taken by another user
  usersDB.findOne({ username }, (err, existingUser) => {
    if (existingUser && existingUser.username !== currentUser.username) {
      return res.redirect('/dashboard?error=This+username+is+already+taken.');
    }

    // Update user data
    usersDB.update(
      { username: currentUser.username },
      { $set: { firstName, lastName, username, email, phone } },
      {},
      (err, numReplaced) => {
        if (err || numReplaced === 0) {
          return res.redirect('/dashboard?error=Failed+to+update+data.');
        }

        // Update session
        req.session.user = {
          ...req.session.user,
          username,
          firstName,
          lastName
        };

        return res.redirect('/dashboard?success=Data+updated+successfully.');
      }
    );
  });
});

// ---------------------- PASSWORD CHANGE ---------------------- //
// POST /dashboard/reset-password – change user password
router.post('/dashboard/reset-password', (req, res) => {
  const { newPassword, confirmPassword } = req.body;
  const userId = req.session.user._id;

  // Check password length
  if (!newPassword || newPassword.length < 8) {
    return res.redirect('/dashboard?error=Password+too+short.');
  }

  // Fetch user from DB
  usersDB.findOne({ _id: userId }, (err, user) => {
    if (!user) {
      return res.redirect('/dashboard?error=User+not+found.');
    }

    // Verify current password
    bcrypt.compare(confirmPassword, user.password, (err, match) => {
      if (!match) {
        return res.redirect('/dashboard?error=Incorrect+current+password.');
      }

      // Hash new password and update
      bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
        usersDB.update(
          { _id: userId },
          { $set: { password: hashedPassword } },
          {},
          () => res.redirect('/dashboard?success=Password+changed+successfully.')
        );
      });
    });
  });
});

// ---------------------- UNENROLL FROM COURSE (FULL) ---------------------- //
// POST /dashboard/unenroll-full/:courseId – remove user from full course
router.post('/dashboard/unenroll-full/:courseId', (req, res) => {
  const courseId = req.params.courseId;
  const username = req.session.user?.username;

  if (!username) return res.redirect('/dashboard?error=Not+logged+in');

  coursesDB.update(
    { _id: courseId },
    { $pull: { participants: { username } } },
    {},
    (err) => {
      if (err) return res.redirect('/dashboard?error=Failed+to+unenroll+from+course');
      res.redirect('/dashboard?success=Unenrolled+from+course');
    }
  );
});

// ---------------------- UNENROLL FROM SINGLE SESSION ---------------------- //
// POST /dashboard/unenroll-partial/:courseId – remove selected date
router.post('/dashboard/unenroll-partial/:courseId', (req, res) => {
  const courseId = req.params.courseId;
  const selectedDate = req.body.date;
  const username = req.session.user?.username;

  if (!username || !selectedDate) {
    return res.redirect('/dashboard?error=Missing+data+to+unenroll.');
  }

  coursesDB.findOne({ _id: courseId }, (err, course) => {
    if (err || !course) {
      return res.redirect('/dashboard?error=Course+not+found.');
    }

    const updatedList = (course.partialParticipants || []).map(p => {
      if (p.username === username) {
        return {
          ...p,
          selectedDates: p.selectedDates.filter(date => date !== selectedDate)
        };
      }
      return p;
    }).filter(p => p.selectedDates.length > 0); // remove if no remaining dates

    coursesDB.update(
      { _id: courseId },
      { $set: { partialParticipants: updatedList } },
      {},
      (err) => {
        if (err) {
          return res.redirect('/dashboard?error=Failed+to+unenroll+from+session');
        }
        return res.redirect('/dashboard?success=Unenrolled+from+session');
      }
    );
  });
});

module.exports = router;
