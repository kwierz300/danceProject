// routes/user.js
// ---------------------- IMPORTY I KONFIGURACJA ---------------------- //
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const usersDB = require('../db/usersDB');
const coursesDB = require('../db/coursesDB'); // ❗ wymagane do pobierania zapisów użytkownika

// -------------------- PANEL UŻYTKOWNIKA -------------------- //
// routes/user.js 
router.get('/dashboard', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'user') {
    return res.status(403).send('<h2>Brak dostępu</h2>');
  }

  const username = req.session.user.username;

  usersDB.findOne({ username }, (err, user) => {
    if (err || !user) return res.send('Błąd podczas ładowania danych');

    coursesDB.find({}, (err, allCourses) => {
      if (err) return res.send('Błąd podczas ładowania kursów');

      // 🔹 Kursy zapisane w całości
      const fullCourses = allCourses
      .filter(c => (c.participants || []).some(p => p.username === username))
      .map(c => ({
        _id: c._id,
        title: c.title,
        courseType: c.courseType,
        style: c.style,
        level: c.level,
        sessions: c.sessions, // ⬅️ dodaj to
      }));
    

      // 🔹 Kursy z zapisanymi datami
      const partialCourses = [];

      allCourses.forEach(course => {
        const courseTitle = course.title || '[brak tytułu]'; // na wypadek gdyby brakowało

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

// ---------------------- EDYCJA DANYCH PROFILU ---------------------- //
// POST /dashboard/edit – aktualizacja danych użytkownika
router.post('/dashboard/edit', (req, res) => {
  const { firstName, lastName, username, email, phone } = req.body;
  const currentUser = req.session.user;

  // 🛑 Walidacja pól formularza
  if (!firstName || !lastName || !username || !email || !phone) {
    return res.redirect('/dashboard?error=Uzupełnij+wszystkie+pola.');
  }

  // 🔍 Sprawdzenie, czy nowy login nie jest już zajęty przez innego użytkownika
  usersDB.findOne({ username }, (err, existingUser) => {
    if (existingUser && existingUser.username !== currentUser.username) {
      return res.redirect('/dashboard?error=Taki+login+już+istnieje.');
    }

    // ✅ Aktualizacja danych
    usersDB.update(
      { username: currentUser.username },
      { $set: { firstName, lastName, username, email, phone } },
      {},
      (err, numReplaced) => {
        if (err || numReplaced === 0) {
          return res.redirect('/dashboard?error=Nie+udało+się+zaktualizować+danych.');
        }

        // 🔁 Aktualizacja sesji użytkownika
        req.session.user = {
          ...req.session.user,
          username,
          firstName,
          lastName
        };

        return res.redirect('/dashboard?success=Dane+zostały+zaktualizowane.');
      }
    );
  });
});

// ---------------------- ZMIANA HASŁA ---------------------- //
// POST /dashboard/reset-password – zmiana hasła użytkownika
router.post('/dashboard/reset-password', (req, res) => {
  const { newPassword, confirmPassword } = req.body;
  const userId = req.session.user._id;

  // 🛑 Sprawdzenie długości nowego hasła
  if (!newPassword || newPassword.length < 8) {
    return res.redirect('/dashboard?error=Nowe+hasło+jest+za+krótkie.');
  }

  // 🔍 Pobranie użytkownika z bazy
  usersDB.findOne({ _id: userId }, (err, user) => {
    if (!user) {
      return res.redirect('/dashboard?error=Nie+znaleziono+użytkownika.');
    }

    // 🔐 Sprawdzenie aktualnego hasła
    bcrypt.compare(confirmPassword, user.password, (err, match) => {
      if (!match) {
        return res.redirect('/dashboard?error=Niepoprawne+aktualne+hasło.');
      }

      // 🔒 Hashowanie nowego hasła i aktualizacja w bazie
      bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
        usersDB.update(
          { _id: userId },
          { $set: { password: hashedPassword } },
          {},
          () => res.redirect('/dashboard?success=Hasło+zostało+zmienione.')
        );
      });
    });
  });
});

// POST: Wypisz się z całego kursu
router.post('/dashboard/unenroll-full/:courseId', (req, res) => {
  const courseId = req.params.courseId;
  const username = req.session.user?.username;

  if (!username) return res.redirect('/dashboard?error=Nie+zalogowano');

  coursesDB.update(
    { _id: courseId },
    { $pull: { participants: { username } } },
    {},
    (err) => {
      if (err) return res.redirect('/dashboard?error=Nie+udało+się+wypisać+z+kursu');
      res.redirect('/dashboard?success=Wypisano+z+kursu');
    }
  );
});

// POST: Wypisanie z pojedynczych zajęć (wybrana data)
// POST: Wypisanie z pojedynczej daty zajęć
router.post('/dashboard/unenroll-partial/:courseId', (req, res) => {
  const courseId = req.params.courseId;
  const selectedDate = req.body.date;
  const username = req.session.user?.username;

  if (!username || !selectedDate) {
    return res.redirect('/dashboard?error=Brak+danych+do+wypisania.');
  }

  coursesDB.findOne({ _id: courseId }, (err, course) => {
    if (err || !course) {
      return res.redirect('/dashboard?error=Nie+znaleziono+kursu.');
    }

    const updatedList = (course.partialParticipants || []).map(p => {
      if (p.username === username) {
        return {
          ...p,
          selectedDates: p.selectedDates.filter(date => date !== selectedDate)
        };
      }
      return p;
    }).filter(p => p.selectedDates.length > 0); // usuwa całkowicie, jeśli nie ma już dat

    coursesDB.update(
      { _id: courseId },
      { $set: { partialParticipants: updatedList } },
      {},
      (err) => {
        if (err) {
          return res.redirect('/dashboard?error=Nie+udało+się+wypisać+z+zajęć');
        }
        return res.redirect('/dashboard?success=Wypisano+z+zajęć');
      }
    );
  });
});

module.exports = router;
