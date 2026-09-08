document.getElementById('year').textContent = new Date().getFullYear();

const header = document.querySelector('.site-header');
const menuToggle = document.getElementById('menuToggle');

menuToggle.addEventListener('click', () => {
  const isOpen = header.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

document.querySelectorAll('.nav a, .footer-nav a').forEach((link) => {
  link.addEventListener('click', () => {
    header.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});

const form = document.getElementById('reserveForm');
const formNote = document.getElementById('formNote');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  // Placeholder handler — wire this up to your CRM, email service, or
  // booking backend before going live.
  formNote.textContent = "Thanks! We'll be in touch within one business day.";
  form.reset();
});
