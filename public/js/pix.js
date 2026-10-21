/* Bloco de pagamento Pix (QR Code + "copia e cola"). Usado no cardápio, no acompanhamento e no painel. */
function pixHtml(pix, total, opts = {}) {
  const title = opts.title || 'Pague com Pix';
  const note = opts.note || 'Abra o app do seu banco, escolha Pix e leia o QR Code ou use "Pix Copia e Cola". Depois de pagar, envie o comprovante ao estabelecimento pelo WhatsApp. O pedido só é confirmado pelo estabelecimento.';
  return `<div class="panel text-start mt-3" data-pix-box><h2 class="h6 mb-2"><i class="bi bi-qr-code"></i> ${esc(title)}</h2>
    <img src="${esc(pix.qr)}" alt="QR Code Pix para pagamento" class="img-fluid d-block mx-auto" style="max-width:260px;image-rendering:pixelated">
    <div class="text-center mt-2"><strong class="fs-5">${money(total)}</strong><div class="small text-muted">Recebedor: ${esc(pix.name)}</div></div>
    <button type="button" class="btn btn-success w-100 mt-3" data-copy-pix="${esc(pix.payload)}"><i class="bi bi-clipboard"></i> Copiar código Pix</button>
    <details class="mt-2"><summary class="small">Ver o código</summary><textarea class="form-control form-control-sm mt-1" readonly rows="4" aria-label="Código Pix copia e cola">${esc(pix.payload)}</textarea></details>
    <p class="small text-muted mt-2 mb-0">${esc(note)}</p></div>`;
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy-pix]'); if (!b) return;
  const value = b.dataset.copyPix; let copied = false;
  try { await navigator.clipboard.writeText(value); copied = true; } catch {
    const ta = document.createElement('textarea'); ta.value = value; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
    try { copied = document.execCommand('copy'); } catch { /* sem suporte */ } ta.remove();
  }
  const old = b.innerHTML;
  b.innerHTML = copied ? '<i class="bi bi-check2"></i> Código copiado!' : 'Não foi possível copiar. Abra "Ver o código" e copie manualmente.';
  setTimeout(() => { b.innerHTML = old; }, 3000);
});
