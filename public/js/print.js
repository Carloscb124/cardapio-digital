(async () => {
  const id = location.pathname.split('/').pop();
  try {
    const r = await fetch(`/api/orders/${encodeURIComponent(id)}/ticket`, { credentials: 'same-origin' });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Falha ao carregar a comanda.');
    document.getElementById('ticket').textContent = d.text;
    document.title = `Comanda #${d.order.number}`;
    if (location.search.includes('auto=1')) setTimeout(() => window.print(), 300);
  } catch (e) { document.getElementById('err').textContent = e.message; document.getElementById('ticket').textContent = ''; }
  document.getElementById('btn').onclick = () => window.print();
})();
