/**
 * Client-side helper functions
 */
document.addEventListener('DOMContentLoaded', () => {
  // Handle form errors
  const errorEl = document.querySelector('.flash.error');
  if (errorEl) {
    setTimeout(() => {
      errorEl.style.animation = 'fadeOut 0.5s';
      setTimeout(() => errorEl.remove(), 500);
    }, 4000);
  }

  const successEl = document.querySelector('.flash.success');
  if (successEl) {
    setTimeout(() => {
      successEl.style.animation = 'fadeOut 0.5s';
      setTimeout(() => successEl.remove(), 500);
    }, 4000);
  }
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});
