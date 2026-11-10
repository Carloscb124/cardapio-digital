/* Importar e exportar cardápio (CSV dentro de um ZIP): análise com prévia, confirmação e histórico. */
VIEWS.io = { label: 'Importar e exportar', icon: 'bi-arrow-left-right', roles: ['admin'], async render(root) {
  let cats = [], runs = [];
  try { [cats, runs] = await Promise.all([api('/api/categories'), api('/api/io/runs')]); } catch (e) { return fail(e); }
  const ACAO = { ambos: 'Inserir novos e atualizar os existentes', inserir: 'Só inserir registros novos', atualizar: 'Só atualizar registros existentes' };
  const DUP = { vincular: 'Usar o registro existente de mesmo nome (e atualizá-lo)', criar: 'Criar um novo mesmo assim', ignorar: 'Ignorar e não mexer no existente' };
  root.innerHTML = `<h1 class="h4 mb-1"><i class="bi bi-arrow-left-right"></i> Importar e exportar</h1>
    <p class="text-muted">Leve o cardápio de outra plataforma para cá, ou exporte para editar em planilha e importar de volta. Os dados vão em arquivos CSV (UTF-8) dentro de um pacote ZIP. Nada é apagado por uma importação.</p>
    <div class="row g-3">
      <div class="col-lg-5"><div class="panel h-100"><h2 class="h6"><i class="bi bi-box-arrow-up"></i> Exportar</h2>
        <div class="form-check"><input class="form-check-input" type="radio" name="scope" id="scAll" value="all" checked><label class="form-check-label" for="scAll">Cardápio inteiro</label></div>
        <div class="form-check"><input class="form-check-input" type="radio" name="scope" id="scCat" value="cat"><label class="form-check-label" for="scCat">Só categorias selecionadas</label></div>
        <div id="catBox" class="border rounded p-2 my-2 d-none">${cats.length ? cats.map((c) => `<label class="d-block"><input type="checkbox" class="catpick" value="${c.id}"> ${esc(c.name)}</label>`).join('') : '<span class="text-muted small">Nenhuma categoria cadastrada.</span>'}</div>
        <div class="form-check form-switch mt-2"><input class="form-check-input" type="checkbox" id="exStock"><label class="form-check-label" for="exStock">Incluir estoque (insumos e ficha técnica)</label></div>
        <div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="exImg" checked><label class="form-check-label" for="exImg">Incluir as imagens enviadas</label></div>
        <a class="btn btn-primary w-100 mt-3" id="exGo" href="/api/io/export"><i class="bi bi-download"></i> Baixar pacote (.zip)</a>
        <a class="small d-block mt-2" id="exModel" href="/api/io/modelo">Baixar um modelo de exemplo (.zip)</a></div></div>
      <div class="col-lg-7"><div class="panel h-100"><h2 class="h6"><i class="bi bi-box-arrow-in-down"></i> Importar</h2>
        <label class="form-label" for="ioFiles">Arquivos (.csv ou .zip, até 12 arquivos de 4 MB)</label>
        <input class="form-control" type="file" id="ioFiles" multiple accept=".csv,.zip,.json,text/csv,application/zip">
        <div class="row g-2 mt-1">
          <div class="col-12"><label class="form-label" for="ioSource">Plataforma de origem (opcional)</label><input class="form-control" id="ioSource" maxlength="60" placeholder="ex.: zapermenu"><div class="form-text">Ajuda a reconhecer os mesmos produtos em importações futuras, sem duplicar.</div></div>
          <div class="col-md-6"><label class="form-label" for="ioAcao">O que fazer</label><select class="form-select" id="ioAcao">${Object.entries(ACAO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="col-md-6"><label class="form-label" for="ioDup">Se já existir um item de mesmo nome (sem vínculo)</label><select class="form-select" id="ioDup">${Object.entries(DUP).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        </div>
        <div class="d-flex flex-wrap gap-2 mt-3"><button class="btn btn-primary" id="ioAnalyze" type="button"><i class="bi bi-search"></i> Analisar (simulação)</button><button class="btn btn-success d-none" id="ioConfirm" type="button"><i class="bi bi-check2-circle"></i> Confirmar importação</button><button class="btn btn-light d-none" id="ioCancel" type="button">Cancelar</button></div>
        <div class="text-danger small mt-2" id="ioErr" role="alert"></div></div></div>
    </div>
    <div id="ioReport" class="mt-3"></div>
    <h2 class="h6 mt-4">Histórico de importações</h2><div class="panel table-responsive" id="ioRuns"></div>`;

  const $r = (s) => $(s, root), q = (s) => $$(s, root);
  const scope = () => ($r('#scCat').checked ? 'cat' : 'all');
  const exportUrl = () => {
    const p = new URLSearchParams();
    if (scope() === 'cat') p.set('categorias', q('.catpick:checked').map((x) => x.value).join(','));
    if ($r('#exStock').checked) p.set('estoque', '1'); if (!$r('#exImg').checked) p.set('imagens', '0');
    const s = p.toString(); return '/api/io/export' + (s ? '?' + s : '');
  };
  const refreshExport = () => { $r('#catBox').classList.toggle('d-none', scope() !== 'cat'); $r('#exGo').href = exportUrl(); $r('#exGo').classList.toggle('disabled', scope() === 'cat' && !q('.catpick:checked').length); };
  root.addEventListener('change', (e) => { if (e.target.closest('.panel') && ['scope', 'exStock', 'exImg'].includes(e.target.name || e.target.id) || e.target.classList.contains('catpick')) refreshExport(); if (['ioFiles', 'ioSource', 'ioAcao', 'ioDup'].includes(e.target.id)) invalidate(); });
  root.addEventListener('input', (e) => { if (e.target.id === 'ioSource') invalidate(); });

  const runsHtml = () => { $r('#ioRuns').innerHTML = runs.length ? `<table class="table table-sm align-middle mb-0"><thead><tr><th>Quando</th><th>Origem</th><th>Situação</th><th>Novos</th><th>Atualizados</th><th>Erros</th><th>Quem</th></tr></thead><tbody>${runs.map((r) => `<tr><td>${dt(r.em)}</td><td>${esc(r.sistema_origem)}</td><td>${r.status === 'aplicada' ? '<span class="badge bg-success">Aplicada</span>' : '<span class="badge bg-danger">Rejeitada</span>'}</td><td>${r.totais ? r.totais.novos : '—'}</td><td>${r.totais ? r.totais.atualizados : '—'}</td><td>${r.totais ? r.totais.erros : '—'}</td><td class="text-muted">${esc(r.usuario || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="text-muted">Nenhuma importação ainda.</div>'; };

  let analyzed = null; // chave do que foi analisado: a confirmação só vale para os mesmos arquivos e opções
  const keyNow = () => JSON.stringify([[...($r('#ioFiles').files || [])].map((f) => [f.name, f.size]), $r('#ioSource').value, $r('#ioAcao').value, $r('#ioDup').value]);
  function invalidate() { if (analyzed && analyzed !== keyNow()) { analyzed = null; $r('#ioConfirm').classList.add('d-none'); $r('#ioCancel').classList.add('d-none'); $r('#ioReport').innerHTML = '<div class="alert alert-secondary py-2">Os arquivos ou opções mudaram: analise de novo antes de confirmar.</div>'; } }

  const form = (modo) => {
    const fd = new FormData(); fd.append('modo', modo);
    [...$r('#ioFiles').files].forEach((f) => fd.append('files', f, f.name));
    fd.append('acao', $r('#ioAcao').value); fd.append('duplicatas', $r('#ioDup').value); if ($r('#ioSource').value.trim()) fd.append('sistema_origem', $r('#ioSource').value.trim());
    return fd;
  };
  const BADGE = { novos: 'success', atualizados: 'primary', sem_alteracao: 'secondary', ignorados: 'warning text-dark' };
  const NOME = { novos: 'novo', atualizados: 'atualizar', sem_alteracao: 'sem alteração', ignorados: 'ignorado' };
  function report(d, applied) {
    const t = d.totais, rows = Object.entries(d.resumo);
    const lvl = t.erros ? 'danger' : applied ? 'success' : 'info';
    $r('#ioReport').innerHTML = `<div class="alert alert-${lvl}" role="status"><strong>${applied ? 'Importação concluída' : t.erros ? 'Foram encontrados erros: nada foi gravado' : 'Simulação concluída: nada foi gravado ainda'}.</strong>
        ${t.erros ? `${t.erros} erro(s) a corrigir.` : `${t.novos} novo(s), ${t.atualizados} atualizado(s), ${t.sem_alteracao} sem alteração, ${t.ignorados} ignorado(s).`} <span class="text-muted small">Origem: ${esc(d.sistema_origem)} · ${d.duracao_ms} ms</span></div>
      ${rows.length ? `<div class="panel table-responsive mb-3"><table class="table table-sm align-middle mb-0"><thead><tr><th>Tipo de registro</th><th>Novos</th><th>Atualizados</th><th>Sem alteração</th><th>Ignorados</th></tr></thead><tbody>${rows.map(([e, s]) => `<tr><td>${esc(s.rotulo)}</td><td>${s.novos}</td><td>${s.atualizados}</td><td>${s.sem_alteracao}</td><td>${s.ignorados}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${d.erros.length ? `<div class="panel table-responsive mb-3"><h3 class="h6 text-danger">Erros${d.erros_truncados ? ' (mostrando os primeiros 500)' : ''}</h3><table class="table table-sm mb-0"><thead><tr><th>Arquivo</th><th>Linha</th><th>Coluna</th><th>O que corrigir</th></tr></thead><tbody>${d.erros.map((x) => `<tr><td>${esc(x.arquivo || '—')}</td><td>${x.linha ?? '—'}</td><td>${esc(x.coluna || '—')}</td><td>${esc(x.mensagem)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${d.avisos.length ? `<details class="panel mb-3"><summary class="fw-semibold">${d.avisos.length} aviso(s)</summary><ul class="small mt-2 mb-0">${d.avisos.slice(0, 100).map((x) => `<li>${esc(x.arquivo || '')}${x.linha ? ':' + x.linha : ''} ${x.coluna ? '(' + esc(x.coluna) + ') ' : ''}${esc(x.mensagem)}</li>`).join('')}</ul></details>` : ''}
      ${rows.length && !t.erros ? `<details class="panel"><summary class="fw-semibold">Prévia dos registros</summary>${rows.map(([e, s]) => (d.previa[e] || []).length ? `<h3 class="h6 mt-3">${esc(s.rotulo)}</h3><ul class="list-unstyled small mb-0">${d.previa[e].map((p) => `<li class="py-1 border-bottom"><span class="badge bg-${BADGE[p.acao]}">${NOME[p.acao]}</span> <strong>${esc(p.nome || p.chave || '')}</strong> <span class="text-muted">${esc(p.arquivo)}:${p.linha}</span>${p.motivo ? ` <span class="text-muted">· ${esc(p.motivo)}</span>` : ''}${p.mudancas ? `<div class="text-muted">${p.mudancas.map((m) => `${esc(m.campo)}: ${esc(m.de ?? '∅')} → ${esc(m.para ?? '∅')}`).join(' · ')}</div>` : ''}</li>`).join('')}</ul>` : '').join('')}</details>` : ''}`;
  }

  async function go(modo) {
    $r('#ioErr').textContent = '';
    if (![...$r('#ioFiles').files].length) { $r('#ioErr').textContent = 'Escolha pelo menos um arquivo .csv ou .zip.'; return; }
    const btn = $r(modo === 'aplicar' ? '#ioConfirm' : '#ioAnalyze'); btn.disabled = true;
    try {
      const d = await apiForm('/api/io/import', form(modo));
      report(d, d.aplicada);
      if (modo === 'simular') { analyzed = keyNow(); const okay = !d.totais.erros && (d.totais.novos + d.totais.atualizados) > 0; $r('#ioConfirm').classList.toggle('d-none', !okay); $r('#ioCancel').classList.toggle('d-none', false); }
      else { analyzed = null; $r('#ioConfirm').classList.add('d-none'); $r('#ioCancel').classList.add('d-none'); if (d.aplicada) { toast('Importação concluída.'); $r('#ioFiles').value = ''; } }
      if (modo === 'aplicar') { runs = await api('/api/io/runs'); runsHtml(); }
    } catch (e) { $r('#ioErr').textContent = e.message; if (e.status === 401) fail(e); }
    btn.disabled = false;
  }
  $r('#ioAnalyze').addEventListener('click', () => go('simular'));
  $r('#ioConfirm').addEventListener('click', () => go('aplicar'));
  $r('#ioCancel').addEventListener('click', () => { analyzed = null; $r('#ioFiles').value = ''; $r('#ioReport').innerHTML = ''; $r('#ioConfirm').classList.add('d-none'); $r('#ioCancel').classList.add('d-none'); });
  refreshExport(); runsHtml();
} };
