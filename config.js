// Settings for the calendar. See README.md.

export const firebaseConfig = {
  apiKey: "AIzaSyBzMqm1-wfQ8HKisBZNozVfHaRlvlrV3JQ",
  authDomain: "calendarforelliotandmela.firebaseapp.com",
  projectId: "calendarforelliotandmela",
  storageBucket: "calendarforelliotandmela.firebasestorage.app",
  messagingSenderId: "746122646142",
  appId: "1:746122646142:web:6cbca12c82e695071d7e2f",
};

// The two sides of the calendar. Names can also be changed later from the page itself.
// timeZone uses IANA names: Boston is America/New_York, Vinaros is Europe/Madrid.
export const PEOPLE = {
  a: { name: "Mela", city: "Boston", timeZone: "America/New_York" },
  b: { name: "Deany", city: "Vinaròs", timeZone: "Europe/Madrid" },
};
