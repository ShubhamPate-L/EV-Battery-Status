// Demo credentials only — no real backend yet.
const DEMO_USERNAME = 'admin';
const DEMO_PASSWORD = 'battery2026';

const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const loginCard = document.querySelector('.login-card');

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (username === DEMO_USERNAME && password === DEMO_PASSWORD) {
    sessionStorage.setItem('evAuthenticated', 'true');
    window.location.href = 'index.html';
  } else {
    loginError.classList.add('is-visible');
    loginCard.classList.remove('is-shaking');
    void loginCard.offsetWidth; // restart animation
    loginCard.classList.add('is-shaking');
  }
});