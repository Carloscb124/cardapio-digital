const token = new URLSearchParams(location.search).get('token');
const show = (t, c) => { const m = $('#msg'); m.className = 'alert py-2 alert-' + c; m.textContent = t; };
if (!token) { $('#form').classList.add('d-none'); show('Link inválido.', 'danger'); }
$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('#p1').value !== $('#p2').value) return show('As senhas não conferem.', 'danger');
  $('#go').disabled = true;
  try {
    await api('/api/auth/reset', { method: 'POST', body: { token, password: $('#p1').value } });
    $('#form').classList.add('d-none'); $('#back').classList.remove('d-none'); show('Senha alterada com sucesso.', 'success');
  } catch (err) { show(err.message, 'danger'); $('#go').disabled = false; }
});
