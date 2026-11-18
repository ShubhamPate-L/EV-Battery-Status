// Redirects back to login.html if the user hasn't signed in this session.
if (sessionStorage.getItem('evAuthenticated') !== 'true') {
  window.location.href = 'login.html';
}