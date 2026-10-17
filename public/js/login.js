const form = document.getElementById('form'), errBox = document.getElementById('error'), btn = document.getElementById('submit');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.classList.add('d-none');
  btn.disabled = true; btn.textContent = 'Entrando...';
  try {
    await api('/api/auth/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } });
    location.href = '/admin';
  } catch (err) {
    errBox.textContent = err.message; errBox.classList.remove('d-none');
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});
