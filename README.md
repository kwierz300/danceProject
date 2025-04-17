# Dance Course Booking System

A web application for booking dance courses, created as part of a university coursework project. The system supports guest users, registered users, organisers, and administrators, and allows full and partial course enrolment.

## Live Preview

> This project is intended to be run locally. See instructions below.
    The project is also available online at:

    https://danceproject-production.up.railway.app/

## Technology Stack

- **Node.js**
- **Express.js**
- **NeDB** 
- **Mustache** 
- **Bootstrap 5** 
- **HTML / CSS / JS**

## Project Structure

```
├── db/                  # NeDB database files and access scripts
├── public/              # Static assets (CSS, images, etc.)
├── routes/              # Express route handlers
├── views/               # Mustache templates (partials + full pages)
│   ├── partials/
│   └── *.mustache
├── translations.js      # Multilingual support
├── index.js             # Main application entry point
├── package.json
└── README.md
```

## Features

### Guests
- View homepage and available courses
- Switch language (English/Polish)
- Enroll in a full course or selected dates (without logging in)

### Registered Users
- Login / register
- Manage profile, change password
- See and manage enrolled courses/sessions
- Enroll in courses with password confirmation

### Organisers
- Add/edit/delete courses
- View participant lists (full and by date)
- Edit or remove regular users
- No access to admin privileges

### Admin
- View and manage all users
- Promote users to organiser or admin
- Reset passwords for any user
- Cannot delete themselves (security restriction)

## Security

- Passwords hashed with bcrypt
- Input validation for all forms (frontend + backend)
- Access control by role (user, organiser, admin)
- Session-based authentication

See full security discussion in documentation files (OWASP 2021 applied).

## System Testing

- Manual tests with screenshots included in the documentation
- Tests cover navigation, validation, language switching, role-based access, course booking and more
- All panels (user, organiser, admin) tested individually

## Multilingual Support

- Full English/Polish toggle across all views
- Dynamic translation of text using `translations.js`
- Default language is English

## Setup Instructions

1. **Clone the repository:**

```bash
git clone https://github.com/kwierz300/danceProject.git
cd dance-booking-system
```

2. **Install dependencies:**

```bash
npm install
```

3. **Run the application:**

```bash
node index.js
```

4. **Open in your browser:**

```
http://localhost:3000
```


## Test Accounts for Reviewers

To help with testing, the following accounts have been created:

### Regular User
- **Username:** `user1`
- **Password:** `user123!`

### Organiser
- **Username:** `organiser1`
- **Password:** `org123!`

### Administrator
- **Username:** `admin`
- **Password:** `admin123!`
 
## Known Issues

- Some labels do not switch language fully
- No email confirmation or password recovery

## Author

Kamil Wierzbinski  
Glasgow Caledonian University [Web Development 2 Coursework Project]  
Year: 2025
