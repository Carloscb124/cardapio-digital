const form = document.getElementById('form'), errBox = document.getElementById('error'), btn = document.getElementById('submit'), hint = document.getElementById('hint'), emailEl = document.getElementById('email'), passEl = document.getElementById('password');
document.getElementById('toggle').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.textContent = on ? 'Ocultar' : 'Mostrar';
  passEl.type = on ? 'text' : 'password';
});
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errBox.classList.add('d-none');
  btn.disabled = true; btn.textContent = 'Entrando...';
  try {
    await api('/api/auth/login', { method: 'POST', body: { email: emailEl.value.trim(), password: passEl.value } });
    location.href = '/admin';
  } catch (err) {
    errBox.textContent = err.message; errBox.classList.remove('d-none');
    if (err.status === 401) hint.classList.remove('d-none');
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});
