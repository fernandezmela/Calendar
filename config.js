// Settings for the calendar. See README.md.

// Paste the object Firebase gives you under Project settings → Your apps → Web app.
// These keys are safe to put on GitHub: they only identify the project.
// What actually keeps the calendar private is firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyBzMqm1-wfQ8HKisBZNozVfHaRlvlrV3JQ",
  authDomain: "calendarforelliotandmela.firebaseapp.com",
  projectId: "calendarforelliotandmela",
  storageBucket: "calendarforelliotandmela.firebasestorage.app",
  messagingSenderId: "746122646142",
  appId: "1:746122646142:web:6cbca12c82e695071d7e2f",
};

// The two sides of the calendar. Names can also be changed later from the page itself.
// timeZone uses IANA names: Boston is America/New_York, Madrid is Europe/Madrid.
// Emails do NOT go here. They go only in the Firestore rules inside the Firebase console.
export const PEOPLE = {
  a: { name: "Her", city: "Boston", timeZone: "America/New_York" },
  b: { name: "Him", city: "Madrid", timeZone: "Europe/Madrid" },
};
