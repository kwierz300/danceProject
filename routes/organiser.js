const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const usersDB = require('../db/usersDB');
const coursesDB = require('../db/coursesDB');
const { t } = require('../translations');

// Panel organizatora – widok listy użytkowników
router.get('/organiser', (req, res) => {
  if (!req.session.user || (req.session.user.role !== 'organiser' && req.session.user.role !== 'admin')) {
    return res.status(403).send('<h2>Brak dostępu</h2>');
  }

  const searchQuery = req.query.lastName?.trim()?.toLowerCase();
  const sortBy = req.query.sortBy || 'lastName';
  const order = req.query.order === 'desc' ? -1 : 1;
  const errorMessage = req.query.error;
  const successMessage = req.query.success;

  usersDB.find({ role: 'user' }, (err, allUsers) => {
    if (err) return res.send('Błąd pobierania danych.');

    let filteredUsers = searchQuery
      ? allUsers.filter(u => u.lastName?.toLowerCase().includes(searchQuery))
      : allUsers;

    filteredUsers.sort((a, b) => {
      const aVal = (a[sortBy] || '').toLowerCase();
      const bVal = (b[sortBy] || '').toLowerCase();
      if (aVal < bVal) return -1 * order;
      if (aVal > bVal) return 1 * order;
      return 0;
    });

    // Ustawiamy flagę czy to ten sam użytkownik
    filteredUsers.forEach(u => {
      u.isSelf = u.username === req.session.user.username;
    });

    res.render('organiser', {
      username: req.session.user.username,
      users: filteredUsers,
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

// ---------------- Formularz edycji użytkownika ----------------
router.get('/organiser/edit/:id', (req, res) => {
  usersDB.findOne({ _id: req.params.id }, (err, user) => {
    if (err || !user || user.role !== 'user') {
      return res.status(404).send(t(req, 'User not found'));
    }

    res.render('editUser', {
      title: t(req, 'Edit user'),
      user
    });
  });
});

// ---------------- Zapisanie edytowanego użytkownika ----------------
router.post('/organiser/edit/:id', (req, res) => {
  const userId = req.params.id;
  const { firstName, lastName, username, email, phone } = req.body;

  if (!firstName || !lastName || !username || !email || !phone) {
    return res.redirect(`/organiser/edit/${userId}?error=Uzupełnij+wszystkie+pola.`);
  }

  usersDB.findOne({ username }, (err, existingUser) => {
    if (existingUser && existingUser._id != userId) {
      return res.render('editUser', {
        title: t(req, 'Edit user'),
        user: { _id: userId, firstName, lastName, username, email, phone },
        errorMessage: t(req, 'This username is already taken.')
      });
    }
  

    usersDB.update(
      { _id: userId },
      { $set: { firstName, lastName, username, email, phone } },
      {},
      (err, numReplaced) => {
        if (err || numReplaced === 0) {
          return res.redirect('/organiser?error=Nie+udało+się+zaktualizować+danych.');
        }

        res.redirect('/organiser?success=Dane+użytkownika+zostały+zaktualizowane.');
      }
    );
  });
});

// ---------------- Usuwanie użytkownika ----------------
router.post('/organiser/delete/:id', (req, res) => {
  usersDB.findOne({ _id: req.params.id }, (err, user) => {
    if (!user || user.role !== 'user') {
      return res.redirect('/organiser?error=Nie+można+usunąć+tego+użytkownika.');
    }

    usersDB.remove({ _id: req.params.id }, {}, (err, numRemoved) => {
      return res.redirect('/organiser?success=Użytkownik+został+usunięty.');
    });
  });
});

// ---------------- Resetowanie hasła ----------------
router.post('/organiser/reset-password/:id', (req, res) => {
  const userId = req.params.id;
  const { newPassword, confirmPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.redirect('/organiser?error=Nowe+hasło+jest+za+krótkie.');
  }

  usersDB.findOne({ _id: userId }, (err, targetUser) => {
    if (!targetUser || targetUser.role !== 'user') {
      return res.redirect('/organiser');
    }

    const isSelf = targetUser.username === req.session.user.username;

    if (isSelf) {
      usersDB.findOne({ username: req.session.user.username }, (err, organiser) => {
        if (!organiser) return res.redirect('/organiser');

        bcrypt.compare(confirmPassword, organiser.password, (err, match) => {
          if (!match) {
            return res.redirect('/organiser?error=Błędne+hasło+–+nie+można+zresetować+własnego+hasła.');
          }

          bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
            usersDB.update({ _id: userId }, { $set: { password: hashedPassword } }, {}, () => {
              return res.redirect('/organiser?success=Hasło+zostało+zmienione.');
            });
          });
        });
      });
    } else {
      bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
        usersDB.update({ _id: userId }, { $set: { password: hashedPassword } }, {}, () => {
          return res.redirect('/organiser?success=Hasło+użytkownika+zostało+zresetowane.');
        });
      });
    }
  });
});

// POST: Dodanie nowego kursu
router.post('/organiser/add-course', (req, res) => {
  const {
    title,
    description,
    location,
    fullPrice,
    singlePrice,
    capacity,
    sessions,
    style,
    level,
    duration,
    courseType, // <-- Nowe pole
    totalClasses 
  } = req.body;

  const parsedSessions = Array.isArray(sessions)
  ? sessions
  : sessions.split(',').map(s => s.trim()).filter(Boolean);


  const newCourse = {
    title,
    description,
    location,
    fullPrice: Number(fullPrice),
    singlePrice: Number(singlePrice),
    capacity: Number(capacity),
    totalClasses: Number(totalClasses), // ✔️ konwersja liczby tylko tutaj
    style,
    level,
    duration: Number(duration),
    sessions: parsedSessions,
    courseType,

    participants: []
  };
  

  coursesDB.insert(newCourse, (err, createdCourse) => {
    if (err) {
      return res.redirect('/organiser?error=Nie+udało+się+dodać+kursu.');
    }
    return res.redirect('/organiser?success=Nowy+kurs+został+utworzony.');
  });
});

router.post('/organiser/editCourse/:id', (req, res) => {
  const courseId = req.params.id;
  const returnTo = req.body.returnTo || '/organiser';

  const {
    title,
    description,
    location,
    fullPrice,
    singlePrice,
    capacity,
    totalClasses,
    style,
    level,
    duration,
    courseType,
    sessions
  } = req.body;

  const parsedSessions = Array.isArray(sessions)
    ? sessions
    : sessions.split(',').map(s => s.trim()).filter(Boolean);

  const updatedCourse = {
    title,
    description,
    location,
    fullPrice: Number(fullPrice),
    singlePrice: Number(singlePrice),
    capacity: Number(capacity),
    totalClasses: Number(totalClasses),
    style,
    level,
    duration: Number(duration),
    courseType,
    sessions: parsedSessions
  };

  coursesDB.update({ _id: courseId }, { $set: updatedCourse }, {}, (err, numReplaced) => {
    if (err || numReplaced === 0) {
      return res.redirect(returnTo + '?error=Nie+udało+się+zaktualizować+kursu.');
    }

    return res.redirect(returnTo + '?success=Zaktualizowano+kurs');
  });
});


router.get('/organiser/editCourse/:id', (req, res) => {
  const courseId = req.params.id;

  console.log('➡️ Otrzymano żądanie edycji kursu:', courseId);

  coursesDB.findOne({ _id: courseId }, (err, course) => {
    if (err || !course) {
      return res.send('Nie znaleziono kursu.');
    }

    // 🔽 Dodajemy pomocnicze flagi dla Mustache (bo nie obsługuje porównań)
    course.sessionsString = course.sessions.join(', ');

    course.isLevelBeginner = course.level === 'Początkujący';
    course.isLevelIntermediate = course.level === 'Średniozaawansowany';
    course.isLevelAdvanced = course.level === 'Zaawansowany';

    course.isTypeWeekend = course.courseType === 'Weekend Workshop';
    course.isTypeWeekly = course.courseType === 'Weekly Sessions';
    course.isTypeSingle = course.courseType === 'Single Classes';

    course.isStyleSalsa = course.style === 'Salsa';
    course.isStyleHipHop = course.style === 'Hip-Hop';
    course.isStyleBallroom = course.style === 'Taniec towarzyski';
    course.isStyleTango = course.style === 'Tango';
    course.isStyleBachata = course.style === 'Bachata';
    course.isStyleJazz = course.style === 'Jazz';
    course.isStyleBalet = course.style === 'Balet';
    course.isStyleStreet = course.style === 'Street Dance';
    course.isStyleZumba = course.style === 'Zumba';
    course.isStyleContemporary = course.style === 'Contemporary';

    // 🔁 Dodaj returnTo do widoku, np. wróć do poprzedniej strony lub lista kursów
    const returnTo = req.query.returnTo || req.headers.referer || '/organiser';

    res.render('editCourse', { course, returnTo });
  });
});


// POST: Usunięcie kursu
router.post('/organiser/delete-course/:id', (req, res) => {
  const courseId = req.params.id;
  const { confirmPassword } = req.body;
  const currentUser = req.session.user;

  if (!currentUser || currentUser.role !== 'organiser') {
    return res.status(403).send('Brak dostępu');
  }

  usersDB.findOne({ username: currentUser.username }, (err, organiser) => {
    if (err || !organiser) {
      return res.redirect('/organiser?error=Nie+znaleziono+organizatora.');
    }

    // Sprawdzenie poprawności hasła
    bcrypt.compare(confirmPassword, organiser.password, (err, match) => {
      if (!match) {
        return res.redirect(`/organiser/edit-course/${courseId}?error=Nieprawidłowe+hasło.`);
      }

      // Usunięcie kursu
      coursesDB.remove({ _id: courseId }, {}, (err, numRemoved) => {
        if (err || numRemoved === 0) {
          return res.redirect('/organiser?error=Nie+udało+się+usunąć+kursu.');
        }

        return res.redirect('/organiser?success=Kurs+został+usunięty.');
      });
    });
  });
});

// Lista uczestników danego kursu – widok dla organizatora
router.get('/organiser/course/:courseId/participants', (req, res) => {
  const courseId = req.params.courseId;

  coursesDB.findOne({ _id: courseId }, (err, course) => {
    if (err || !course) {
      return res.redirect('/organiser?error=Nie+znaleziono+kursu');
    }

    // 🔍 Przetwarzamy uczestników, żeby mieć pewność że każdy ma imię, nazwisko itd.
    const enhancedParticipants = course.participants.map(p => ({
      ...p,
      isGuest: p.isGuest,
      firstName: p.firstName || '',   // dla zalogowanych
      lastName: p.lastName || '',
      phone: p.phone || '',
      name: p.name || '',             // dla gości
      username: p.username || ''      // dla zalogowanych
    }));

    console.log('📋 Lista uczestników:', enhancedParticipants);

    res.render('participants', {
      title: 'Lista uczestników',
      courseTitle: course.title,
      courseId,
      participants: enhancedParticipants
    });
  });
});

// POST: Usuń uczestnika z kursu (na podstawie username lub name)
router.post('/organiser/course/:courseId/remove-participant', (req, res) => {
  const courseId = req.params.courseId;
  const { username, name } = req.body;

  let condition = {};

  if (username) {
    condition = { username }; // dla zalogowanych
  } else if (name) {
    condition = { name };     // dla gości (usunie po imieniu+nazwisku)
  } else {
    return res.redirect(`/organiser/course/${courseId}/participants?error=Brak+danych+uczestnika`);
  }

  coursesDB.update(
    { _id: courseId },
    { $pull: { participants: condition } },
    {},
    (err) => {
      if (err) {
        return res.redirect(`/organiser/course/${courseId}/participants?error=Nie+udało+się+usunąć+uczestnika`);
      }

      return res.redirect(`/organiser/course/${courseId}/participants?success=Uczestnik+usunięty`);
    }
  );
});

// Lista uczestników pojedynczych zajec – widok dla organizatora
router.get('/course/:id/participants-for-date', (req, res) => {
  const courseId = req.params.id;
  const selectedDate = req.query.selectedDate;

  coursesDB.findOne({ _id: courseId }, (err, course) => {
    if (err || !course) {
      return res.send('Nie znaleziono kursu.');
    }

    // Filtruj tylko tych uczestników, którzy mają wybraną datę
    const participants = course.participants.filter(p =>
      Array.isArray(p.sessions) && p.sessions.includes(selectedDate)
    );

    res.render('participantsForDate', {
      title: 'Uczestnicy na datę',
      courseTitle: course.title,
      courseId,
      selectedDate,
      participants
    });
  });
});

// GET: Formularz wyboru daty zajęć
router.get('/organiser/course/:courseId/participants-by-date', (req, res) => {
  const courseId = req.params.courseId;

  coursesDB.findOne({ _id: courseId }, (err, course) => {
    if (err || !course) {
      return res.redirect('/organiser?error=Nie+znaleziono+kursu');
    }

    res.render('participantsByDate', {
      title: 'Wybierz datę zajęć',
      courseId,
      courseTitle: course.title,
      availableDates: course.sessions,
      successMessage: req.query.success,
      errorMessage: req.query.error
    });
  });
});

// GET: Uczestnicy na konkretną datę
router.get('/organiser/course/:courseId/participants-for-date', (req, res) => {
  const courseId = req.params.courseId;
  const selectedDate = req.query.selectedDate;

  coursesDB.findOne({ _id: courseId }, (err, course) => {
    if (err || !course) {
      return res.redirect('/organiser?error=Nie+znaleziono+kursu');
    }

    // Filtrujemy tylko tych uczestników, którzy zapisali się na daną datę
    const participantsForDate = (course.partialParticipants || []).filter(p =>
      Array.isArray(p.selectedDates) && p.selectedDates.includes(selectedDate)
    );

    res.render('participantsForDate', {
      title: 'Uczestnicy na wybraną datę',
      courseTitle: course.title,
      selectedDate,
      participants: participantsForDate,
      courseId
    });
  });
});

// POST: Usuń uczestnika tylko z jednej konkretnej daty
router.post('/organiser/course/:courseId/remove-participant-for-date', (req, res) => {
  const courseId = req.params.courseId;
  const { username, name, email, selectedDate } = req.body;

  if (!selectedDate) {
    return res.redirect(`/organiser/course/${courseId}/participants-by-date?error=Brak+daty`);
  }

  coursesDB.findOne({ _id: courseId }, (err, course) => {
    if (err || !course) {
      return res.redirect(`/organiser/course/${courseId}/participants-by-date?error=Nie+znaleziono+kursu`);
    }

    let updatedList = (course.partialParticipants || []).map(p => {
      // Dopasowanie uczestnika (zalogowany lub gość)
      const isMatch = username
        ? p.username === username
        : (p.name === name && p.email === email);

      if (isMatch) {
        // Filtruj tylko inne daty – usuń wybraną
        const updatedDates = (p.selectedDates || []).filter(d => d !== selectedDate);
        return updatedDates.length > 0
          ? { ...p, selectedDates: updatedDates }
          : null; // jeśli nie ma już dat, usuń cały obiekt
      }
      return p;
    }).filter(Boolean); // usuń null

    coursesDB.update(
      { _id: courseId },
      { $set: { partialParticipants: updatedList } },
      {},
      (err) => {
        if (err) {
          return res.redirect(`/organiser/course/${courseId}/participants-by-date?error=Błąd+przy+usuwaniu`);
        }

        return res.redirect(`/organiser/course/${courseId}/participants-by-date?success=Usunięto+z+tej+daty`);
      }
    );
  });
});



module.exports = router;
