const express = require('express');
const router = express.Router();
const coursesDB = require('../db/coursesDB');
const usersDB = require('../db/usersDB');
const bcrypt = require('bcryptjs');
const { t } = require('../translations'); // ✅ Używamy centralnego tłumaczenia

// Domyślne przekierowanie z /courses na /courses/weekly
router.get('/courses', (req, res) => {
  res.redirect('/courses/weekly');
});

// Kursy cotygodniowe
router.get('/courses/weekly', (req, res) => {
  coursesDB.find({ courseType: 'Weekly Sessions' }, (err, courses) => {
    if (err) {
      return res.render('courses', {
        title: t(req, 'Weekly Sessions'),
        errorMessage: t(req, 'Could not load courses')
      });
    }

    const username = req.session.user?.username;

    const enrichedCourses = courses.map(course => {
      const alreadyEnrolledFully = (course.participants || []).some(p => p.username === username);
      return {
        ...course,
        alreadyEnrolledFully
      };
    });

    res.render('courses', {
      title: t(req, 'Weekly Sessions'),
      courses: enrichedCourses,
      hasCourses: enrichedCourses.length > 0,
      sessionUser: req.session.user,
      isUser: req.session.user?.role === 'user',
      isOrganiser: req.session.user?.role === 'organiser',
      successMessage: req.query.success,
      errorMessage: req.query.error
    });
  });
});

// Kursy weekendowe i indywidualne
router.get('/courses/other', (req, res) => {
  coursesDB.find({ courseType: { $ne: 'Weekly Sessions' } }, (err, courses) => {
    if (err) {
      return res.render('courses', {
        title: t(req, 'Weekend Workshops'),
        errorMessage: t(req, 'Could not load courses')
      });
    }

    const username = req.session.user?.username;
    const filteredCourses = courses.filter(c => c && c.title);

    const enrichedCourses = filteredCourses.map(course => {
      const alreadyEnrolledFully = (course.participants || []).some(p => p.username === username);
      return {
        ...course,
        alreadyEnrolledFully
      };
    });

    res.render('courses', {
      title: t(req, 'Weekend Workshops'),
      courses: enrichedCourses,
      hasCourses: enrichedCourses.length > 0,
      sessionUser: req.session.user,
      isUser: req.session.user?.role === 'user',
      isOrganiser: req.session.user?.role === 'organiser',
      successMessage: req.query.success,
      errorMessage: req.query.error
    });
  });
});

// 🔐 Zalogowany użytkownik – pełny zapis
router.post('/courses/enrol/:id', (req, res) => {
  const courseId = req.params.id;
  const { confirmPassword } = req.body;
  const user = req.session.user;

  if (!user) {
    return res.redirect('/courses/weekly?error=' + encodeURIComponent(t(req, 'You must be logged in')));
  }

  usersDB.findOne({ username: user.username }, (err, dbUser) => {
    if (err || !dbUser) {
      return res.redirect('/courses/weekly?error=' + encodeURIComponent(t(req, 'User not found')));
    }

    bcrypt.compare(confirmPassword, dbUser.password, (err, isMatch) => {
      if (!isMatch) {
        return res.redirect('/courses/weekly?error=' + encodeURIComponent(t(req, 'Incorrect password')));
      }

      coursesDB.findOne({ _id: courseId }, (err, course) => {
        if (err || !course) {
          return res.redirect('/courses/weekly?error=' + encodeURIComponent(t(req, 'Course not found')));
        }

        if (course.participants.length >= course.capacity) {
          return res.redirect('/courses/weekly?error=' + encodeURIComponent(t(req, 'Course is full')));
        }

        const alreadyEnrolled = course.participants.some(p => p.username === user.username);
        if (alreadyEnrolled) {
          return res.redirect('/courses/weekly?error=' + encodeURIComponent(t(req, 'Already enrolled')));
        }

        const participant = {
          username: dbUser.username,
          firstName: dbUser.firstName || '',
          lastName: dbUser.lastName || '',
          phone: dbUser.phone || '',
          isGuest: false
        };

        coursesDB.update(
          { _id: courseId },
          { $push: { participants: participant } },
          {},
          (err) => {
            if (err) {
              return res.redirect('/courses/weekly?error=' + encodeURIComponent(t(req, 'Error during enrollment')));
            }

            if (!req.session.fullCourseIds) {
              req.session.fullCourseIds = [];
            }
            req.session.fullCourseIds.push(courseId);

            return res.redirect('/courses/weekly?success=' + encodeURIComponent(t(req, 'Enrollment successful')));
          }
        );
      });
    });
  });
});

// 👤 Gość – zapis na cały kurs
router.post('/courses/guest-enrol/:id', (req, res) => {
  const courseId = req.params.id;
  const { firstName, lastName, email, phone } = req.body;

  if (!firstName || !lastName || !email || !phone) {
    return res.redirect('/courses?error=' + encodeURIComponent(t(req, 'Fill in all fields')));
  }

  const participant = {
    name: `${firstName} ${lastName}`,
    email,
    phone,
    isGuest: true
  };

  coursesDB.findOne({ _id: courseId }, (err, course) => {
    if (err || !course) {
      return res.redirect('/courses?error=' + encodeURIComponent(t(req, 'Course not found')));
    }

    if (course.participants.length >= course.capacity) {
      return res.redirect('/courses?error=' + encodeURIComponent(t(req, 'Course is full')));
    }

    coursesDB.update(
      { _id: courseId },
      { $push: { participants: participant } },
      {},
      () => res.redirect('/courses?success=' + encodeURIComponent(t(req, 'Enrollment successful')))
    );
  });
});

// ✅ Zapis na pojedyncze zajęcia
router.post('/courses/partial-enrol/:id', (req, res) => {
  const courseId = req.params.id;
  const selectedSessions = Array.isArray(req.body.selectedSessions)
    ? req.body.selectedSessions
    : [req.body.selectedSessions];

  if (!selectedSessions || selectedSessions.length === 0) {
    return res.redirect(`/courses/weekly?error=${encodeURIComponent(t(req, 'No session dates selected'))}`);
  }

  const isLoggedIn = !!req.session.user;

  if (isLoggedIn) {
    const { confirmPassword } = req.body;
    const user = req.session.user;

    usersDB.findOne({ username: user.username }, (err, dbUser) => {
      if (err || !dbUser) {
        return res.redirect('/courses/weekly?error=' + encodeURIComponent(t(req, 'User not found')));
      }

      bcrypt.compare(confirmPassword, dbUser.password, (err, isMatch) => {
        if (!isMatch) {
          return res.redirect('/courses/weekly?error=' + encodeURIComponent(t(req, 'Incorrect password')));
        }

        const participant = {
          username: dbUser.username,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          phone: dbUser.phone,
          selectedDates: selectedSessions,
          isGuest: false
        };

        coursesDB.update(
          { _id: courseId },
          { $push: { partialParticipants: participant } },
          {},
          () => res.redirect('/courses/weekly?success=' + encodeURIComponent(t(req, 'Enrollment for selected dates successful')))
        );
      });
    });

  } else {
    const { firstName, lastName, email, phone } = req.body;

    if (!firstName || !lastName || !email || !phone) {
      return res.redirect('/courses/weekly?error=' + encodeURIComponent(t(req, 'Fill in all fields')));
    }

    const participant = {
      name: `${firstName} ${lastName}`,
      email,
      phone,
      selectedDates: selectedSessions,
      isGuest: true
    };

    coursesDB.update(
      { _id: courseId },
      { $push: { partialParticipants: participant } },
      {},
      () => res.redirect('/courses/weekly?success=' + encodeURIComponent(t(req, 'Reservation successful')))
    );
  }
});

module.exports = router;
