(function () {
  'use strict';

  /* ---------- Dados ---------- */
  var KEY = 'pgm-v1';

  function padrao() {
    return {
      v: 1,
      ingredientes: [],   // {id, nome, tipo:'g'|'un', preco, qtd}
      sabores: [],        // {id, nome, peso, itens:[{ingId,qtd}], outros, preco, margem|null}
      historico: [],      // orçamentos salvos: {id, criadoEm, cliente, total, itens, linhas}
      orcamento: { cliente: '', linhas: [] }, // linhas: {id, saborId, qtd, un:'pct'|'g'}
      ajustes: {
        margem: 50,
        arredondar: 0.5,
        instagram: '@pipocasgourmetdamel',
        whatsapp: '(27) 99776-4554',
        validade: '',
        obs: ''
      }
    };
  }

  function mesclar(base, d) {
    var r = Object.assign({}, base, d);
    r.orcamento = Object.assign({}, base.orcamento, d.orcamento || {});
    r.ajustes = Object.assign({}, base.ajustes, d.ajustes || {});
    if (!Array.isArray(r.ingredientes)) r.ingredientes = [];
    if (!Array.isArray(r.sabores)) r.sabores = [];
    if (!Array.isArray(r.historico)) r.historico = [];
    if (!Array.isArray(r.orcamento.linhas)) r.orcamento.linhas = [];
    return r;
  }

  function carregar() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return mesclar(padrao(), JSON.parse(raw));
    } catch (e) { /* começa vazio */ }
    return padrao();
  }

  var S = carregar();

  function salvar() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch (e) { aviso('Não consegui salvar neste aparelho.'); }
  }

  /* ---------- Sincronização com a planilha do Google ---------- */
  var KEY_SY = 'pgm-sync';
  function syPadrao() { return { url: '', senha: '', versao: 0, pendentes: [], ultimo: 0, erro: '' }; }
  function carregarSY() {
    try {
      var r = localStorage.getItem(KEY_SY);
      if (r) return Object.assign(syPadrao(), JSON.parse(r));
    } catch (e) { /* sem sincronização */ }
    return syPadrao();
  }
  var SY = carregarSY();
  function salvarSY() { try { localStorage.setItem(KEY_SY, JSON.stringify(SY)); } catch (e) { /* ignora */ } }

  var sincronizando = false, timerSync = null;

  function enfileirar(m) {
    if (!SY.url) return; // sem planilha conectada, não há o que enviar
    SY.pendentes = SY.pendentes.filter(function (p) { return !(p.colecao === m.colecao && p.id === m.id); });
    SY.pendentes.push(m);
    salvarSY();
    agendarSync();
  }
  function marcar(colecao, rec) {
    rec.atualizado = Date.now();
    enfileirar({ colecao: colecao, id: rec.id, atualizado: rec.atualizado, excluido: false, dados: rec });
  }
  function marcarAjustes() {
    S.ajustes.atualizado = Date.now();
    enfileirar({ colecao: 'ajustes', id: 'ajustes', atualizado: S.ajustes.atualizado, excluido: false, dados: S.ajustes });
  }
  function marcarExcluido(colecao, id) {
    enfileirar({ colecao: colecao, id: id, atualizado: Date.now(), excluido: true, dados: null });
  }
  function enfileirarTudo() {
    var agora = Date.now(), p = [];
    ['ingredientes', 'sabores', 'historico'].forEach(function (c) {
      S[c].forEach(function (r) {
        if (!r.atualizado) r.atualizado = agora;
        p.push({ colecao: c, id: r.id, atualizado: r.atualizado, excluido: false, dados: r });
      });
    });
    if (S.ajustes.atualizado) p.push({ colecao: 'ajustes', id: 'ajustes', atualizado: S.ajustes.atualizado, excluido: false, dados: S.ajustes });
    SY.pendentes = p;
    salvarSY(); salvar();
  }
  function agendarSync() {
    clearTimeout(timerSync);
    timerSync = setTimeout(function () { sincronizar(); }, 1500);
  }

  function aplicarRemotos(regs) {
    var mudou = false;
    (regs || []).forEach(function (r) {
      if (r.colecao === 'ajustes') {
        if (!r.excluido && r.dados && (r.atualizado || 0) > (S.ajustes.atualizado || 0)) {
          S.ajustes = Object.assign({}, padrao().ajustes, r.dados);
          mudou = true;
        }
        return;
      }
      var lista = S[r.colecao];
      if (!Array.isArray(lista)) return;
      var i = lista.findIndex(function (x) { return x.id === r.id; });
      var local = i >= 0 ? lista[i] : null;
      if (r.excluido) {
        if (local && (r.atualizado || 0) >= (local.atualizado || 0)) { lista.splice(i, 1); mudou = true; }
      } else if (r.dados && (!local || (r.atualizado || 0) > (local.atualizado || 0))) {
        if (local) lista[i] = r.dados; else lista.push(r.dados);
        mudou = true;
      }
    });
    return mudou;
  }

  var renderAgendado = false;
  function renderQuandoLivre() {
    var ativo = document.activeElement;
    var digitando = ativo && /^(INPUT|SELECT|TEXTAREA)$/.test(ativo.tagName);
    if (dlg.open || digitando) {
      if (!renderAgendado) { renderAgendado = true; setTimeout(function () { renderAgendado = false; renderQuandoLivre(); }, 2000); }
      return;
    }
    renderTudo();
  }

  function sincronizar() {
    if (!SY.url || sincronizando) return Promise.resolve();
    if (navigator.onLine === false) { mostrarSync(); return Promise.resolve(); }
    sincronizando = true; mostrarSync();
    var envio = SY.pendentes.slice();
    return fetch(SY.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ senha: SY.senha, desde: SY.versao, mudancas: envio })
    })
      .then(function (r) {
        return r.text().then(function (t) {
          try { return JSON.parse(t); }
          catch (e) { throw new Error('O endereço respondeu, mas não é o script. Confira a implantação (Qualquer pessoa) e se salvou o código.'); }
        });
      })
      .then(function (res) {
        if (!res || !res.ok) throw new Error(res && res.erro === 'senha' ? 'Senha incorreta.' : 'O script deu erro: ' + ((res && res.erro) || 'sem detalhe'));
        SY.pendentes = SY.pendentes.filter(function (p) {
          return !envio.some(function (e) { return e.colecao === p.colecao && e.id === p.id && e.atualizado === p.atualizado; });
        });
        var mudou = aplicarRemotos(res.registros);
        SY.versao = res.versao; SY.ultimo = Date.now(); SY.erro = '';
        salvarSY();
        if (mudou) { salvar(); renderQuandoLivre(); }
      })
      .catch(function (e) {
        SY.erro = (e && e.name !== 'TypeError' && e.message) ? e.message : 'Sem conexão com a planilha. Vou tentar de novo.';
        salvarSY();
      })
      .then(function () {
        sincronizando = false; mostrarSync();
        if (SY.pendentes.length && !SY.erro) agendarSync();
      });
  }

  function textoSync() {
    if (!SY.url) return '';
    if (sincronizando) return 'Sincronizando…';
    if (SY.erro) return SY.erro;
    if (SY.pendentes.length) return 'Aguardando enviar (' + SY.pendentes.length + ')';
    return SY.ultimo ? 'Sincronizado às ' + new Date(SY.ultimo).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  }
  function mostrarSync() {
    var el = $('#sync-estado');
    if (el) { var t = textoSync(); el.textContent = t; el.hidden = !t; el.dataset.erro = SY.erro ? '1' : ''; }
    var st = $('#sync-status-set');
    if (st) st.textContent = textoSync() || (SY.url ? 'Conectado' : 'Não conectado');
  }
  function iniciarSync() {
    mostrarSync();
    document.addEventListener('visibilitychange', function () { if (!document.hidden) sincronizar(); });
    window.addEventListener('online', function () { sincronizar(); });
    setInterval(function () { if (!document.hidden) sincronizar(); }, 60000);
    sincronizar();
  }

  /* ---------- Utilidades ---------- */
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function porNome(a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }

  // Aceita "5,5", "5.5" e "1.250,50"
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    var t = String(v == null ? '' : v).trim().replace(/[^\d.,-]/g, '');
    if (!t) return 0;
    if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.');
    var n = parseFloat(t);
    return isFinite(n) ? n : 0;
  }
  function txt(n) { return n ? String(n).replace('.', ',') : ''; }

  var fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  function brl(n) { return fmtBRL.format(isFinite(n) ? n : 0); }
  function dec(n, d) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d == null ? 1 : d }).format(isFinite(n) ? n : 0); }
  function qtdTxt(tipo, q) {
    if (tipo === 'un') return dec(q, 1) + ' un';
    return q >= 1000 ? dec(q / 1000, 2) + ' kg' : dec(q, 0) + ' g';
  }

  var toastTimer;
  function aviso(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  /* ---------- Contas ---------- */
  function ingPorId(id) { return S.ingredientes.find(function (i) { return i.id === id; }); }
  function saborPorId(id) { return S.sabores.find(function (s) { return s.id === id; }); }

  // custo de 1 g (ou de 1 unidade, para embalagem etc.)
  function custoUn(ing) { return ing.qtd > 0 ? ing.preco / ing.qtd : 0; }

  function custoSabor(s) {
    var soIng = 0;
    (s.itens || []).forEach(function (it) {
      var ing = ingPorId(it.ingId);
      if (ing) soIng += (it.qtd || 0) * custoUn(ing);
    });
    var outros = s.outros || 0;
    return { ingredientes: soIng, outros: outros, total: soIng + outros };
  }

  function margemDe(s) {
    var m = (s.margem === null || s.margem === undefined || s.margem === '') ? S.ajustes.margem : s.margem;
    return Math.max(0, Math.min(95, m));
  }

  function arredondar(p) {
    var passo = S.ajustes.arredondar;
    if (passo > 0) return Math.ceil(p / passo - 1e-9) * passo;
    return Math.round(p * 100) / 100;
  }

  function analise(s) {
    var c = custoSabor(s);
    var m = margemDe(s);
    var minimo = c.total > 0 ? c.total / (1 - m / 100) : 0;
    var sugerido = c.total > 0 ? arredondar(minimo) : 0;
    var definido = s.preco > 0;
    var venda = definido ? s.preco : sugerido;
    var lucro = venda - c.total;
    var margemReal = venda > 0 ? (lucro / venda) * 100 : 0;
    return {
      ingredientes: c.ingredientes, outros: c.outros, total: c.total,
      margemAlvo: m, minimo: minimo, sugerido: sugerido,
      definido: definido, venda: venda, lucro: lucro, margemReal: margemReal
    };
  }

  function pacotesDe(l, s) {
    var q = l.qtd || 0;
    if (l.un === 'g') return s.peso > 0 ? q / s.peso : 0;
    return q;
  }

  function calcOrcamento() {
    var r = { custo: 0, minimo: 0, venda: 0, lucro: 0, margem: 0, compras: [], linhas: [] };
    var mapa = {};
    S.orcamento.linhas.forEach(function (l) {
      var s = saborPorId(l.saborId);
      if (!s) return;
      var a = analise(s);
      var pk = pacotesDe(l, s);
      r.custo += a.total * pk;
      r.minimo += a.minimo * pk;
      r.venda += a.venda * pk;
      (s.itens || []).forEach(function (it) {
        mapa[it.ingId] = (mapa[it.ingId] || 0) + (it.qtd || 0) * pk;
      });
      r.linhas.push({ l: l, s: s, a: a, pk: pk });
    });
    r.lucro = r.venda - r.custo;
    r.margem = r.venda > 0 ? (r.lucro / r.venda) * 100 : 0;
    Object.keys(mapa).forEach(function (id) {
      var ing = ingPorId(id);
      if (ing) r.compras.push({ ing: ing, qtd: mapa[id], custo: mapa[id] * custoUn(ing) });
    });
    r.compras.sort(function (a, b) { return a.ing.nome.localeCompare(b.ing.nome, 'pt-BR'); });
    return r;
  }

  /* ---------- Navegação ---------- */
  var TITULOS = { ing: 'Ingredientes', sab: 'Sabores', orc: 'Orçamento', tab: 'Tabela de preços', set: 'Ajustes' };
  var atual = 'ing';

  function ir(nome) {
    atual = nome;
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'v-' + nome; });
    $$('.tabs button').forEach(function (b) {
      if (b.dataset.go === nome) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    $('#title').textContent = TITULOS[nome];
    $('.views').scrollTop = 0;
  }

  /* ---------- Tela: Ingredientes ---------- */
  function renderIng() {
    var h = '<button class="btn bloco" data-act="novo-ing">＋ Novo ingrediente</button>';
    if (!S.ingredientes.length) {
      h += '<div class="vazio"><strong>Comece pelos ingredientes</strong>' +
        '<span>Cadastre milho, chocolate, Nutella, embalagem... com o preço que você pagou e a quantidade que veio.</span></div>';
    } else {
      S.ingredientes.slice().sort(porNome).forEach(function (i) {
        var cu = custoUn(i);
        var valor = i.tipo === 'un' ? brl(cu) + '<small>por unidade</small>' : brl(cu * 100) + '<small>por 100 g</small>';
        h += '<button class="card linha-ing" data-act="edit-ing" data-id="' + i.id + '">' +
          '<span><span class="nome">' + esc(i.nome) + '</span><br><span class="sub">Comprou ' + qtdTxt(i.tipo, i.qtd) + ' por ' + brl(i.preco) + '</span></span>' +
          '<span class="valor">' + valor + '</span></button>';
      });
    }
    $('#v-ing').innerHTML = h;
  }

  /* ---------- Tela: Sabores ---------- */
  function classeHoje(a) {
    if (!a.definido) return 'neutro';
    if (a.lucro <= 0) return 'ruim';
    return a.margemReal + 0.05 >= a.margemAlvo ? 'ok' : 'aviso';
  }

  function renderSab() {
    var h = '<button class="btn bloco" data-act="novo-sab">＋ Novo sabor</button>';
    if (!S.sabores.length) {
      h += '<div class="vazio"><strong>Nenhum sabor ainda</strong>' +
        '<span>Depois de cadastrar os ingredientes, monte cada sabor com as gramas de cada um.</span></div>';
    } else {
      S.sabores.slice().sort(porNome).forEach(function (s) {
        var a = analise(s);
        var linhaHoje;
        if (a.total <= 0) linhaHoje = '<div class="hoje neutro">Adicione ingredientes para calcular o custo.</div>';
        else if (a.definido) linhaHoje = '<div class="hoje ' + classeHoje(a) + '">Vendendo a ' + brl(a.venda) + ' · lucro ' + brl(a.lucro) + ' (' + dec(a.margemReal, 0) + '%)</div>';
        else linhaHoje = '<div class="hoje neutro">Preço de venda não definido: a tabela usa o sugerido.</div>';
        h += '<button class="card" data-act="edit-sab" data-id="' + s.id + '">' +
          '<div class="sab-topo"><strong>' + esc(s.nome) + '</strong><span class="muted">pacote de ' + dec(s.peso, 0) + ' g</span></div>' +
          '<div class="grade3"><div><span>Custo</span><b>' + brl(a.total) + '</b></div>' +
          '<div><span>Mínimo</span><b>' + brl(a.minimo) + '</b></div>' +
          '<div><span>Sugerido</span><b>' + brl(a.sugerido) + '</b></div></div>' +
          linhaHoje + '</button>';
      });
    }
    $('#v-sab').innerHTML = h;
  }

  /* ---------- Tela: Orçamento ---------- */
  function opcoesSabor(sel) {
    var o = '<option value="">Escolha o sabor…</option>';
    S.sabores.slice().sort(porNome).forEach(function (s) {
      o += '<option value="' + s.id + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.nome) + '</option>';
    });
    return o;
  }

  function linhasOrcHtml() {
    var h = '';
    S.orcamento.linhas.forEach(function (l, i) {
      h += '<div class="card orc-linha">' +
        '<div class="full"><select data-orc="saborId" data-i="' + i + '" aria-label="Sabor">' + opcoesSabor(l.saborId) + '</select></div>' +
        '<input type="text" inputmode="decimal" data-orc="qtd" data-i="' + i + '" value="' + esc(txt(l.qtd)) + '" placeholder="Quantidade" aria-label="Quantidade">' +
        '<select data-orc="un" data-i="' + i + '" aria-label="Unidade">' +
        '<option value="pct"' + (l.un !== 'g' ? ' selected' : '') + '>pacotes</option>' +
        '<option value="g"' + (l.un === 'g' ? ' selected' : '') + '>gramas</option></select>' +
        '<div class="rodape"><span class="muted" data-lsum="' + i + '"></span>' +
        '<button class="btn perigo pequeno" data-act="rm-linha" data-i="' + i + '">Remover</button></div></div>';
    });
    return h;
  }

  var orcAba = 'novo';
  function dataBR(ms) { return new Date(ms).toLocaleDateString('pt-BR'); }

  function htmlSalvos() {
    if (!S.historico.length) {
      return '<div class="vazio"><strong>Nenhum orçamento salvo</strong><span>Monte um pedido e toque em "Salvar orçamento".</span></div>';
    }
    return S.historico.slice().sort(function (a, b) { return b.criadoEm - a.criadoEm; }).map(function (h) {
      return '<button class="card linha-ing" data-act="ver-orc" data-id="' + h.id + '">' +
        '<span><span class="nome">' + esc(h.cliente || 'Sem nome') + '</span><br><span class="sub">' + dataBR(h.criadoEm) + ' · ' + h.itens.length + ' sabor(es)</span></span>' +
        '<span class="valor">' + brl(h.total) + '</span></button>';
    }).join('');
  }

  function renderOrc() {
    var box = $('#v-orc');
    if (!S.sabores.length && !S.historico.length) {
      box.innerHTML = '<div class="vazio"><strong>Cadastre os sabores primeiro</strong><span>O orçamento usa o custo de cada sabor.</span>' +
        '<button class="btn sec pequeno" data-go="sab">Ir para Sabores</button></div>';
      return;
    }
    var h = '<div class="seg" role="group" aria-label="Orçamento">' +
      '<button data-act="orc-aba" data-aba="novo" aria-pressed="' + (orcAba === 'novo') + '">Novo pedido</button>' +
      '<button data-act="orc-aba" data-aba="salvos" aria-pressed="' + (orcAba === 'salvos') + '">Salvos (' + S.historico.length + ')</button></div>';
    if (orcAba === 'salvos') {
      h += htmlSalvos();
    } else if (!S.sabores.length) {
      h += '<div class="vazio"><strong>Cadastre os sabores primeiro</strong><span>O orçamento usa o custo de cada sabor.</span>' +
        '<button class="btn sec pequeno" data-go="sab">Ir para Sabores</button></div>';
    } else {
      h += '<div class="campo"><label for="orc-cliente">Cliente (opcional)</label>' +
        '<input type="text" id="orc-cliente" value="' + esc(S.orcamento.cliente) + '" placeholder="Nome de quem pediu"></div>';
      h += '<div id="orc-linhas" style="display:flex;flex-direction:column;gap:10px">' + linhasOrcHtml() + '</div>';
      h += '<button class="btn sec bloco" data-act="add-linha">＋ Adicionar sabor ao pedido</button>';
      h += '<div id="orc-sum"></div>';
    }
    box.innerHTML = h;
    atualizarResumoOrc();
  }

  function atualizarResumoOrc() {
    var box = $('#orc-sum');
    if (!box) return;
    var r = calcOrcamento();
    $$('[data-lsum]').forEach(function (el) {
      var i = +el.dataset.lsum;
      var l = S.orcamento.linhas[i];
      var s = l && saborPorId(l.saborId);
      if (!s) { el.textContent = ''; return; }
      var a = analise(s);
      var pk = pacotesDe(l, s);
      el.textContent = dec(pk, 1) + ' pacote(s) · ' + brl(a.venda * pk);
    });
    if (!r.linhas.length) { box.innerHTML = '<div class="vazio"><span>Escolha o sabor e a quantidade para ver custo e preço.</span></div>'; return; }
    var h = '<div class="painel">' +
      '<div class="l"><span>Custo para produzir</span><b>' + brl(r.custo) + '</b></div>' +
      '<div class="l"><span>Venda mínima (margem desejada)</span><b>' + brl(r.minimo) + '</b></div>' +
      '<hr>' +
      '<div class="l grande"><span>Cobrar (preço de tabela)</span><b>' + brl(r.venda) + '</b></div>' +
      '<div class="l"><span>Lucro estimado</span><b>' + brl(r.lucro) + ' (' + dec(r.margem, 0) + '%)</b></div></div>';
    if (r.compras.length) {
      h += '<div class="card"><div class="rotulo">Você vai precisar de</div><ul class="lista-compras">';
      r.compras.forEach(function (c) {
        h += '<li><span>' + esc(c.ing.nome) + ' · ' + qtdTxt(c.ing.tipo, c.qtd) + '</span><b>' + brl(c.custo) + '</b></li>';
      });
      h += '</ul></div>';
    }
    h += '<div class="linha-botoes"><button class="btn" data-act="orc-pdf">Enviar PDF</button>' +
      '<button class="btn sec" data-act="orc-share">Enviar texto</button></div>' +
      '<button class="btn sec bloco" data-act="orc-salvar">Salvar orçamento</button>' +
      '<button class="btn perigo bloco" data-act="orc-limpar">Limpar pedido</button>';
    box.innerHTML = h;
  }

  /* ---------- Documentos para o cliente (tela e PDF) ---------- */
  function rodapeDoc() {
    var a = S.ajustes;
    var h = '';
    if (a.validade || a.obs) {
      h += '<div class="rodape-doc">';
      if (a.validade) h += '<span>' + esc(a.validade) + '</span>';
      if (a.obs) h += '<span>' + esc(a.obs) + '</span>';
      h += '</div>';
    }
    var c = [];
    if (a.instagram) c.push('Instagram: ' + esc(a.instagram));
    if (a.whatsapp) c.push('WhatsApp: ' + esc(a.whatsapp));
    if (c.length) h += '<div class="contatos"><span>' + c.join('</span><span>') + '</span></div>';
    return h;
  }

  function docTabela() {
    var linhas = S.sabores.slice().sort(porNome).map(function (s) { return { s: s, a: analise(s) }; })
      .filter(function (x) { return x.a.venda > 0; });
    var h = '<div class="doc"><div class="doc-head"><img src="icons/selo-512.png" alt="">' +
      '<div><h2>Tabela de preços</h2><p>Pipocas Gourmet da Mel · Amor em forma de pipoca</p></div></div>';
    if (!linhas.length) {
      h += '<p class="muted">Cadastre sabores com ingredientes para montar a tabela.</p>';
    } else {
      h += '<table><thead><tr><th>Sabor</th><th class="r">Pacote</th><th class="r">Preço</th></tr></thead><tbody>';
      linhas.forEach(function (x) {
        h += '<tr><td>' + esc(x.s.nome) + '</td><td class="r">' + dec(x.s.peso, 0) + ' g</td><td class="r"><b>' + brl(x.a.venda) + '</b></td></tr>';
      });
      h += '</tbody></table>';
    }
    h += rodapeDoc() + '</div>';
    return h;
  }

  function hojeTxt() { return new Date().toLocaleDateString('pt-BR'); }

  // Foto do orçamento: guarda os valores de quando foi feito
  function snapshotOrcamento() {
    var o = calcOrcamento();
    var uteis = o.linhas.filter(function (x) { return x.pk > 0; });
    return {
      id: uid(), criadoEm: Date.now(), cliente: S.orcamento.cliente.trim(), total: uteis.reduce(function (s, x) { return s + x.a.venda * x.pk; }, 0),
      itens: uteis.map(function (x) {
        return {
          nome: x.s.nome,
          quantidade: x.l.un === 'g' ? dec(x.l.qtd, 0) + ' g (' + dec(x.pk, 1) + ' pacotes)' : dec(x.pk, 1) + ' pacote(s) de ' + dec(x.s.peso, 0) + ' g',
          valor: x.a.venda * x.pk
        };
      }),
      linhas: uteis.map(function (x) { return { saborId: x.l.saborId, qtd: x.l.qtd, un: x.l.un }; })
    };
  }

  function textoOrcamento(h) {
    h = h || snapshotOrcamento();
    var t = '*Orçamento · Pipocas Gourmet da Mel*\n';
    if (h.cliente) t += 'Cliente: ' + h.cliente + '\n';
    t += '\n';
    h.itens.forEach(function (i) { t += '• ' + i.nome + ' · ' + i.quantidade + ' · ' + brl(i.valor) + '\n'; });
    t += '\n*Total: ' + brl(h.total) + '*';
    if (S.ajustes.validade) t += '\n' + S.ajustes.validade;
    return t;
  }

  function textoTabela() {
    var t = '*Tabela de preços · Pipocas Gourmet da Mel*\n\n';
    S.sabores.slice().sort(porNome).forEach(function (s) {
      var a = analise(s);
      if (a.venda > 0) t += '• ' + s.nome + ' (' + dec(s.peso, 0) + ' g) · ' + brl(a.venda) + '\n';
    });
    if (S.ajustes.validade) t += '\n' + S.ajustes.validade;
    if (S.ajustes.instagram) t += '\n' + S.ajustes.instagram;
    return t;
  }

  /* ---------- PDF de verdade (para mandar no WhatsApp) ---------- */
  var COR = { cacau: [62, 42, 42], vinho: [123, 45, 67], blush: [244, 211, 207], mel: [224, 166, 59], creme: [255, 247, 238], linha: [235, 211, 204] };
  var recursos = null;

  function b64(buf) {
    var bytes = new Uint8Array(buf), s = '', n = 0x8000;
    for (var i = 0; i < bytes.length; i += n) s += String.fromCharCode.apply(null, bytes.subarray(i, i + n));
    return btoa(s);
  }

  // Carrega fontes e logo antes do toque no botão, para o PDF sair na hora
  // (o iPhone só deixa abrir a folha de compartilhar logo após o toque).
  function preparar() {
    if (recursos) return Promise.resolve(recursos);
    if (!window.fetch) return Promise.resolve(null);
    return Promise.all(['fonts/Jost_400Regular.ttf', 'fonts/Jost_600SemiBold.ttf', 'icons/selo-512.png'].map(function (u) {
      return fetch(u).then(function (r) { if (!r.ok) throw new Error(u); return r.arrayBuffer(); }).then(b64);
    })).then(function (r) {
      recursos = { regular: r[0], negrito: r[1], selo: r[2] };
      return recursos;
    }).catch(function () { return null; });
  }

  function slug(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  function rodapeDados() {
    var a = S.ajustes, notas = [], contatos = [];
    if (a.validade) notas.push(a.validade);
    if (a.obs) notas.push(a.obs);
    if (a.instagram) contatos.push('Instagram: ' + a.instagram);
    if (a.whatsapp) contatos.push('WhatsApp: ' + a.whatsapp);
    return { notas: notas, contatos: contatos };
  }

  function dadosTabela() {
    var linhas = S.sabores.slice().sort(porNome).map(function (s) { return { s: s, a: analise(s) }; })
      .filter(function (x) { return x.a.venda > 0; })
      .map(function (x) { return [x.s.nome, dec(x.s.peso, 0) + ' g', brl(x.a.venda)]; });
    var r = rodapeDados();
    return {
      titulo: 'Tabela de preços', sub: 'Pipocas Gourmet da Mel · Amor em forma de pipoca',
      cols: [{ t: 'SABOR', x: M_PDF + 2, w: 100 }, { t: 'PACOTE', x: 150, a: 'r' }, { t: 'PREÇO', x: 192, a: 'r', b: true }],
      linhas: linhas, total: null, notas: r.notas, contatos: r.contatos,
      arquivo: 'tabela-de-precos-pipocas-da-mel.pdf'
    };
  }

  function dadosOrcamento(h) {
    h = h || snapshotOrcamento();
    var r = rodapeDados();
    return {
      titulo: 'Orçamento', sub: (h.cliente ? 'Cliente: ' + h.cliente + ' · ' : '') + dataBR(h.criadoEm),
      cols: [{ t: 'SABOR', x: M_PDF + 2, w: 74 }, { t: 'QUANTIDADE', x: 152, a: 'r' }, { t: 'VALOR', x: 192, a: 'r', b: true }],
      linhas: h.itens.map(function (i) { return [i.nome, i.quantidade, brl(i.valor)]; }),
      total: brl(h.total), notas: r.notas, contatos: r.contatos,
      arquivo: 'orcamento-' + (slug(h.cliente) || 'pipocas-da-mel') + '.pdf'
    };
  }

  var M_PDF = 16;
  function montarPDF(c) {
    var J = window.jspdf.jsPDF;
    var doc = new J({ unit: 'mm', format: 'a4', compress: true });
    doc.addFileToVFS('Jost-400.ttf', recursos.regular); doc.addFont('Jost-400.ttf', 'Jost', 'normal');
    doc.addFileToVFS('Jost-600.ttf', recursos.negrito); doc.addFont('Jost-600.ttf', 'Jost', 'bold');
    var M = M_PDF, W = 210 - 2 * M, y;
    function cor(k) { doc.setTextColor(COR[k][0], COR[k][1], COR[k][2]); }
    function fundo(k) { doc.setFillColor(COR[k][0], COR[k][1], COR[k][2]); }
    function cabecalhoTabela() {
      fundo('blush'); doc.rect(M, y, W, 9, 'F');
      doc.setFont('Jost', 'bold'); doc.setFontSize(9); cor('cacau');
      c.cols.forEach(function (k) { doc.text(k.t, k.x, y + 6, { align: k.a === 'r' ? 'right' : 'left' }); });
      y += 9;
    }

    doc.addImage('data:image/png;base64,' + recursos.selo, 'PNG', M, 14, 26, 26);
    doc.setFont('Jost', 'bold'); doc.setFontSize(26); cor('vinho'); doc.text(c.titulo, M + 32, 26);
    doc.setFont('Jost', 'normal'); doc.setFontSize(11); cor('cacau'); doc.text(c.sub, M + 32, 33.5);
    fundo('mel'); doc.rect(M, 45, W, 0.9, 'F');

    y = 52; cabecalhoTabela();
    c.linhas.forEach(function (l) {
      doc.setFont('Jost', 'normal'); doc.setFontSize(11);
      var partes = doc.splitTextToSize(l[0], c.cols[0].w);
      var h = partes.length * 5.4 + 4.4;
      if (y + h > 262) { doc.addPage(); y = 20; cabecalhoTabela(); }
      cor('cacau'); doc.setFont('Jost', 'normal'); doc.setFontSize(11);
      doc.text(partes, c.cols[0].x, y + 6.2);
      for (var i = 1; i < c.cols.length; i++) {
        doc.setFont('Jost', c.cols[i].b ? 'bold' : 'normal');
        doc.text(String(l[i]), c.cols[i].x, y + 6.2, { align: 'right' });
      }
      doc.setDrawColor(COR.linha[0], COR.linha[1], COR.linha[2]); doc.setLineWidth(0.25);
      doc.line(M, y + h, M + W, y + h);
      y += h;
    });

    if (c.total) {
      if (y + 24 > 268) { doc.addPage(); y = 20; }
      y += 6;
      var bw = 98;
      fundo('vinho'); doc.roundedRect(M + W - bw, y, bw, 13, 2, 2, 'F');
      doc.setTextColor(255, 247, 238);
      doc.setFont('Jost', 'bold'); doc.setFontSize(9.5); doc.text('TOTAL DO PEDIDO', M + W - bw + 5, y + 8.2);
      doc.setFontSize(15); doc.text(c.total, M + W - 5, y + 8.8, { align: 'right' });
      y += 13;
    }

    if (c.notas.length) {
      doc.setFont('Jost', 'normal'); doc.setFontSize(10.5);
      var ln = [];
      c.notas.forEach(function (n) { ln = ln.concat(doc.splitTextToSize(n, W - 12)); });
      var hb = ln.length * 5.2 + 8;
      y += 10;
      if (y + hb > 268) { doc.addPage(); y = 20; }
      fundo('creme'); doc.roundedRect(M, y, W, hb, 2.5, 2.5, 'F');
      cor('cacau'); doc.text(ln, M + 6, y + 7);
      y += hb;
    }

    if (c.contatos.length) {
      if (y > 268) doc.addPage();
      fundo('mel'); doc.rect(M, 278, W, 0.6, 'F');
      doc.setFont('Jost', 'bold'); doc.setFontSize(10.5); cor('vinho');
      doc.text(c.contatos.join('     ·     '), M, 285);
    }
    return doc.output('blob');
  }

  function baixarBlob(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // Tudo síncrono dentro do toque: o iPhone só abre o "Compartilhar" logo após o toque.
  function entregarPDF(c) {
    if (!window.jspdf || !recursos) {
      aviso('Preparando o PDF… toque de novo em 2 segundos.');
      preparar();
      return;
    }
    var blob;
    try { blob = montarPDF(c); } catch (e) { aviso('Não consegui gerar o PDF. Use "Enviar texto".'); return; }
    var arq = null;
    try { arq = new File([blob], c.arquivo, { type: 'application/pdf' }); } catch (e) { /* sem File */ }
    if (arq && navigator.canShare && navigator.canShare({ files: [arq] })) {
      navigator.share({ files: [arq], title: c.titulo }).catch(function (e) {
        if (!e || e.name !== 'AbortError') { baixarBlob(blob, c.arquivo); aviso('PDF baixado.'); }
      });
    } else {
      baixarBlob(blob, c.arquivo);
      aviso('PDF gerado.');
    }
  }

  function enviarTexto(texto) {
    if (navigator.share) {
      navigator.share({ text: texto }).catch(function () { /* cancelou */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(function () { aviso('Texto copiado.'); }, function () { aviso('Não deu para copiar.'); });
    } else {
      aviso('Seu navegador não permite compartilhar.');
    }
  }

  /* ---------- Tela: Tabela ---------- */
  function renderTab() {
    var tem = S.sabores.some(function (s) { return analise(s).venda > 0; });
    var h = docTabela();
    if (tem) {
      h += '<div class="linha-botoes"><button class="btn" data-act="tab-pdf">Enviar PDF</button>' +
        '<button class="btn sec" data-act="tab-share">Enviar texto</button></div>' +
        '<p class="dica">Dica: o preço de cada sabor é o "preço que vendo hoje", se você preencheu, ou o sugerido.</p>';
    }
    $('#v-tab').innerHTML = h;
  }

  /* ---------- Tela: Ajustes ---------- */
  function renderSet() {
    var a = S.ajustes;
    var h = '<div class="campo"><label for="aj-margem">Margem de lucro desejada (%)</label>' +
      '<input type="text" id="aj-margem" inputmode="decimal" data-aj="margem" value="' + esc(txt(a.margem)) + '">' +
      '<span class="dica">Margem de 50% significa que metade do preço de venda é lucro. Cada sabor pode ter a sua.</span></div>';
    h += '<div class="campo"><label for="aj-arr">Arredondar o preço sugerido para cima</label>' +
      '<select id="aj-arr" data-aj="arredondar">' +
      [[0, 'Não arredondar'], [0.5, 'Para o próximo R$ 0,50'], [1, 'Para o próximo R$ 1,00']].map(function (o) {
        return '<option value="' + o[0] + '"' + (a.arredondar === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></div>';
    h += '<div class="campo"><label for="aj-insta">Instagram</label><input type="text" id="aj-insta" data-aj="instagram" value="' + esc(a.instagram) + '"></div>';
    h += '<div class="campo"><label for="aj-wpp">WhatsApp</label><input type="text" id="aj-wpp" data-aj="whatsapp" value="' + esc(a.whatsapp) + '" inputmode="tel"></div>';
    h += '<div class="campo"><label for="aj-val">Validade (aparece nos PDFs)</label><input type="text" id="aj-val" data-aj="validade" value="' + esc(a.validade) + '" placeholder="Ex.: Preços válidos até 31/12"></div>';
    h += '<div class="campo"><label for="aj-obs">Observação (aparece nos PDFs)</label><textarea id="aj-obs" data-aj="obs" placeholder="Ex.: Pedido confirmado com sinal de 50%">' + esc(a.obs) + '</textarea></div>';
    var ligado = !!SY.url;
    h += '<div class="card"><div class="rotulo">Sincronizar com a planilha do Google</div>' +
      '<span class="dica">Deixa os mesmos dados nos aparelhos de vocês e guarda uma cópia na sua planilha.</span>' +
      '<div class="campo"><label for="sy-url">Endereço do aplicativo da web</label><input type="text" id="sy-url" value="' + esc(SY.url) + '" placeholder="https://script.google.com/macros/s/…/exec" autocapitalize="off" autocorrect="off" spellcheck="false"' + (ligado ? ' readonly' : '') + '></div>' +
      '<div class="campo"><label for="sy-senha">Senha</label><input type="password" id="sy-senha" value="' + esc(SY.senha) + '" autocomplete="off"' + (ligado ? ' readonly' : '') + '></div>' +
      '<div class="hoje neutro" id="sync-status-set">' + esc(textoSync() || (ligado ? 'Conectado' : 'Não conectado')) + '</div>' +
      (ligado
        ? '<div class="linha-botoes"><button class="btn" data-act="sync-agora">Sincronizar agora</button><button class="btn sec" data-act="sync-desconectar">Desconectar</button></div>'
        : '<button class="btn bloco" data-act="sync-conectar">Conectar e sincronizar</button>') +
      '</div>';
    h += '<div class="card"><div class="rotulo">Backup dos dados</div>' +
      '<span class="dica">Seus dados ficam só neste aparelho. Exporte de vez em quando e guarde o arquivo no iCloud ou mande para você mesmo.</span>' +
      '<div class="linha-botoes"><button class="btn sec" data-act="exportar">Exportar backup</button>' +
      '<button class="btn sec" data-act="importar">Importar backup</button></div>' +
      '<input type="file" id="arq-imp" accept="application/json,.json" hidden></div>';
    h += '<div class="card"><div class="rotulo">Instalar no iPhone</div>' +
      '<span class="dica">Abra o endereço do app no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".</span></div>';
    h += '<button class="btn perigo bloco" data-act="apagar">Apagar todos os dados</button>';
    h += '<p class="dica" style="text-align:center">Pipocas da Mel · versão 1.2</p>';
    $('#v-set').innerHTML = h;
  }

  /* ---------- Diálogos ---------- */
  var dlg = $('#dlg');
  var corpoDlg = $('#dlg-body');
  var rascunho = null;
  var tipoDlg = null;

  function abrirDlg(tipo) { tipoDlg = tipo; if (!dlg.open) dlg.showModal(); }
  function fecharDlg() { if (dlg.open) dlg.close(); rascunho = null; tipoDlg = null; }
  dlg.addEventListener('close', function () { rascunho = null; tipoDlg = null; });

  /* Ingrediente */
  function abrirIng(id) {
    var ing = id ? ingPorId(id) : null;
    if (ing) {
      var un = ing.tipo === 'un' ? 'un' : 'g';
      var q = ing.qtd;
      if (un === 'g' && q >= 1000 && q % 1000 === 0) { un = 'kg'; q = q / 1000; }
      rascunho = { id: ing.id, nome: ing.nome, precoTxt: txt(ing.preco), qtdTxt: txt(q), un: un };
    } else {
      rascunho = { id: null, nome: '', precoTxt: '', qtdTxt: '', un: 'g' };
    }
    desenharIng();
    abrirDlg('ing');
  }

  function previaIng() {
    var preco = num(rascunho.precoTxt);
    var q = num(rascunho.qtdTxt) * (rascunho.un === 'kg' ? 1000 : 1);
    if (!(preco > 0) || !(q > 0)) return 'Preencha preço e quantidade para ver o custo.';
    if (rascunho.un === 'un') return 'Custo: ' + brl(preco / q) + ' por unidade';
    return 'Custo: ' + brl(preco / q * 100) + ' por 100 g (' + brl(preco / q * 1000) + ' o quilo)';
  }

  function desenharIng() {
    var d = rascunho;
    corpoDlg.innerHTML =
      '<div class="dlg-topo"><h2>' + (d.id ? 'Editar ingrediente' : 'Novo ingrediente') + '</h2></div>' +
      '<div class="dlg-corpo">' +
      '<div class="campo"><label for="f-nome">Nome</label><input type="text" id="f-nome" data-f="nome" value="' + esc(d.nome) + '" placeholder="Ex.: Milho de pipoca, Nutella, Embalagem" autocapitalize="sentences"></div>' +
      '<div class="campo"><label for="f-preco">Quanto você pagou (R$)</label><input type="text" id="f-preco" data-f="precoTxt" inputmode="decimal" value="' + esc(d.precoTxt) + '" placeholder="0,00"></div>' +
      '<div class="campo"><label for="f-qtd">Quanto veio nessa compra</label><div class="qtd-un">' +
      '<input type="text" id="f-qtd" data-f="qtdTxt" inputmode="decimal" value="' + esc(d.qtdTxt) + '" placeholder="0">' +
      '<select data-f="un" aria-label="Unidade">' +
      '<option value="g"' + (d.un === 'g' ? ' selected' : '') + '>g</option>' +
      '<option value="kg"' + (d.un === 'kg' ? ' selected' : '') + '>kg</option>' +
      '<option value="un"' + (d.un === 'un' ? ' selected' : '') + '>unidades</option></select></div>' +
      '<span class="dica">Use "unidades" para embalagem, laço, etiqueta...</span></div>' +
      '<div class="painel"><div id="f-previa">' + previaIng() + '</div></div>' +
      '</div>' +
      '<div class="dlg-base"><div class="linha-botoes"><button class="btn sec" data-act="fechar">Cancelar</button>' +
      '<button class="btn" data-act="salvar-ing">Salvar</button></div>' +
      (d.id ? '<button class="btn perigo pequeno bloco" data-act="excluir-ing">Excluir ingrediente</button>' : '') + '</div>';
  }

  function salvarIng() {
    var d = rascunho;
    var nome = d.nome.trim();
    var preco = num(d.precoTxt);
    var q = num(d.qtdTxt) * (d.un === 'kg' ? 1000 : 1);
    if (!nome) { aviso('Dê um nome ao ingrediente.'); return; }
    if (!(q > 0)) { aviso('Informe a quantidade que veio.'); return; }
    if (preco < 0) { aviso('O preço não pode ser negativo.'); return; }
    var tipo = d.un === 'un' ? 'un' : 'g';
    if (d.id) {
      var ing = ingPorId(d.id);
      ing.nome = nome; ing.preco = preco; ing.qtd = q; ing.tipo = tipo;
      marcar('ingredientes', ing);
    } else {
      var novoIng = { id: uid(), nome: nome, tipo: tipo, preco: preco, qtd: q };
      S.ingredientes.push(novoIng);
      marcar('ingredientes', novoIng);
    }
    salvar(); fecharDlg(); renderTudo(); aviso('Ingrediente salvo.');
  }

  function excluirIng() {
    var ing = ingPorId(rascunho.id);
    if (!ing) return;
    var usos = S.sabores.filter(function (s) { return (s.itens || []).some(function (it) { return it.ingId === ing.id; }); });
    var msg = 'Excluir "' + ing.nome + '"?';
    if (usos.length) msg += '\nEle será tirado de ' + usos.length + ' sabor(es) e o custo deles vai mudar.';
    if (!confirm(msg)) return;
    S.ingredientes = S.ingredientes.filter(function (i) { return i.id !== ing.id; });
    marcarExcluido('ingredientes', ing.id);
    S.sabores.forEach(function (s) {
      if ((s.itens || []).some(function (it) { return it.ingId === ing.id; })) {
        s.itens = s.itens.filter(function (it) { return it.ingId !== ing.id; });
        marcar('sabores', s);
      }
    });
    salvar(); fecharDlg(); renderTudo(); aviso('Ingrediente excluído.');
  }

  /* Sabor */
  function abrirSab(id) {
    if (!S.ingredientes.length) {
      aviso('Cadastre os ingredientes primeiro.');
      ir('ing');
      return;
    }
    var s = id ? saborPorId(id) : null;
    if (s) {
      rascunho = {
        id: s.id, nome: s.nome, pesoTxt: txt(s.peso),
        itens: (s.itens || []).map(function (it) { return { ingId: it.ingId, qtdTxt: txt(it.qtd) }; }),
        outrosTxt: txt(s.outros), precoTxt: txt(s.preco),
        margemTxt: (s.margem === null || s.margem === undefined) ? '' : txt(s.margem)
      };
    } else {
      rascunho = { id: null, nome: '', pesoTxt: '90', itens: [{ ingId: '', qtdTxt: '' }], outrosTxt: '', precoTxt: '', margemTxt: '' };
    }
    desenharSab();
    abrirDlg('sab');
  }

  function saborDoRascunho() {
    var d = rascunho;
    return {
      id: d.id, nome: d.nome.trim(), peso: num(d.pesoTxt),
      itens: d.itens.filter(function (it) { return it.ingId; }).map(function (it) { return { ingId: it.ingId, qtd: num(it.qtdTxt) }; }),
      outros: num(d.outrosTxt), preco: num(d.precoTxt),
      margem: d.margemTxt.trim() === '' ? null : num(d.margemTxt)
    };
  }

  function opcoesIng(sel) {
    var o = '<option value="">Escolha…</option>';
    S.ingredientes.slice().sort(porNome).forEach(function (i) {
      o += '<option value="' + i.id + '"' + (i.id === sel ? ' selected' : '') + '>' + esc(i.nome) + '</option>';
    });
    return o;
  }

  function itensSabHtml() {
    return rascunho.itens.map(function (it, i) {
      var ing = ingPorId(it.ingId);
      var un = ing ? (ing.tipo === 'un' ? 'un' : 'g') : '';
      return '<div class="item-linha">' +
        '<select data-item="ingId" data-i="' + i + '" aria-label="Ingrediente">' + opcoesIng(it.ingId) + '</select>' +
        '<input type="text" inputmode="decimal" data-item="qtdTxt" data-i="' + i + '" value="' + esc(it.qtdTxt) + '" placeholder="0" aria-label="Quantidade">' +
        '<span class="un">' + un + '</span>' +
        '<button class="x" data-act="rm-item" data-i="' + i + '" aria-label="Remover ingrediente">×</button>' +
        '<div class="item-sub" data-isub="' + i + '"></div></div>';
    }).join('');
  }

  function painelSabHtml() {
    var s = saborDoRascunho();
    var a = analise(s);
    if (a.total <= 0) return '<div class="painel"><span class="dica">Escolha os ingredientes e as quantidades para ver o custo.</span></div>';
    var h = '<div class="painel">' +
      '<div class="l"><span>Ingredientes e embalagem</span><b>' + brl(a.ingredientes) + '</b></div>';
    if (a.outros > 0) h += '<div class="l"><span>Outros custos</span><b>' + brl(a.outros) + '</b></div>';
    h += '<div class="l"><span>Custo do pacote</span><b>' + brl(a.total) + '</b></div><hr>' +
      '<div class="l"><span>Preço mínimo (margem ' + dec(a.margemAlvo, 0) + '%)</span><b>' + brl(a.minimo) + '</b></div>' +
      '<div class="l grande"><span>Preço sugerido</span><b>' + brl(a.sugerido) + '</b></div>';
    if (a.definido) {
      h += '<hr><div class="l"><span>Vendendo a ' + brl(a.venda) + '</span><b>lucro ' + brl(a.lucro) + ' (' + dec(a.margemReal, 0) + '%)</b></div>';
    }
    return h + '</div>';
  }

  function atualizarSubItens() {
    rascunho.itens.forEach(function (it, i) {
      var el = $('[data-isub="' + i + '"]');
      if (!el) return;
      var ing = ingPorId(it.ingId);
      var q = num(it.qtdTxt);
      el.textContent = ing && q > 0 ? '≈ ' + brl(q * custoUn(ing)) : '';
    });
  }

  function atualizarPainelSab() {
    var box = $('#sab-painel');
    if (box) box.innerHTML = painelSabHtml();
    atualizarSubItens();
  }

  function desenharSab() {
    var d = rascunho;
    var padraoM = S.ajustes.margem;
    corpoDlg.innerHTML =
      '<div class="dlg-topo"><h2>' + (d.id ? 'Editar sabor' : 'Novo sabor') + '</h2></div>' +
      '<div class="dlg-corpo">' +
      '<div class="campo"><label for="s-nome">Nome do sabor</label><input type="text" id="s-nome" data-f="nome" value="' + esc(d.nome) + '" placeholder="Ex.: Pipoca de Nutella"></div>' +
      '<div class="campo"><label for="s-peso">Peso do pacote pronto (g)</label><input type="text" id="s-peso" data-f="pesoTxt" inputmode="decimal" value="' + esc(d.pesoTxt) + '"></div>' +
      '<div class="campo"><span class="rotulo">O que vai em cada pacote</span><div class="itens" id="sab-itens">' + itensSabHtml() + '</div>' +
      '<button class="btn sec pequeno" data-act="add-item">＋ Adicionar ingrediente</button>' +
      '<span class="dica">Inclua a embalagem como 1 unidade.</span></div>' +
      '<div class="campo"><label for="s-outros">Outros custos por pacote (R$, opcional)</label><input type="text" id="s-outros" data-f="outrosTxt" inputmode="decimal" value="' + esc(d.outrosTxt) + '" placeholder="Gás, energia, transporte..."></div>' +
      '<div class="duas">' +
      '<div class="campo"><label for="s-preco">Preço que vendo hoje (R$)</label><input type="text" id="s-preco" data-f="precoTxt" inputmode="decimal" value="' + esc(d.precoTxt) + '" placeholder="Ex.: 15,00"></div>' +
      '<div class="campo"><label for="s-margem">Margem (%)</label><input type="text" id="s-margem" data-f="margemTxt" inputmode="decimal" value="' + esc(d.margemTxt) + '" placeholder="Padrão ' + dec(padraoM, 0) + '"></div></div>' +
      '<div id="sab-painel">' + painelSabHtml() + '</div>' +
      '</div>' +
      '<div class="dlg-base"><div class="linha-botoes"><button class="btn sec" data-act="fechar">Cancelar</button>' +
      '<button class="btn" data-act="salvar-sab">Salvar</button></div>' +
      (d.id ? '<div class="linha-botoes"><button class="btn sec pequeno" data-act="dup-sab">Duplicar sabor</button>' +
        '<button class="btn perigo pequeno" data-act="excluir-sab">Excluir</button></div>' : '') + '</div>';
    atualizarSubItens();
  }

  function salvarSab() {
    var s = saborDoRascunho();
    if (!s.nome) { aviso('Dê um nome ao sabor.'); return; }
    if (!(s.peso > 0)) { aviso('Informe o peso do pacote.'); return; }
    if (!s.itens.length) { aviso('Adicione pelo menos um ingrediente.'); return; }
    if (s.margem !== null) s.margem = Math.max(0, Math.min(95, s.margem));
    if (rascunho.id) {
      var atualS = saborPorId(rascunho.id);
      Object.assign(atualS, s);
      marcar('sabores', atualS);
    } else {
      s.id = uid();
      S.sabores.push(s);
      marcar('sabores', s);
    }
    salvar(); fecharDlg(); renderTudo(); aviso('Sabor salvo.');
  }

  function duplicarSab() {
    var s = saborDoRascunho();
    s.id = uid();
    s.nome = (s.nome || 'Sabor') + ' (cópia)';
    S.sabores.push(s);
    marcar('sabores', s);
    salvar(); fecharDlg(); renderTudo(); aviso('Sabor duplicado. Toque nele para editar.');
  }

  function excluirSab() {
    var s = saborPorId(rascunho.id);
    if (!s || !confirm('Excluir o sabor "' + s.nome + '"?')) return;
    S.sabores = S.sabores.filter(function (x) { return x.id !== s.id; });
    marcarExcluido('sabores', s.id);
    S.orcamento.linhas = S.orcamento.linhas.filter(function (l) { return l.saborId !== s.id; });
    salvar(); fecharDlg(); renderTudo(); aviso('Sabor excluído.');
  }

  function abrirOrcSalvo(id) {
    var h = S.historico.find(function (x) { return x.id === id; });
    if (!h) return;
    var linhas = h.itens.map(function (i) {
      return '<tr><td>' + esc(i.nome) + '</td><td class="r">' + esc(i.quantidade) + '</td><td class="r"><b>' + brl(i.valor) + '</b></td></tr>';
    }).join('');
    corpoDlg.innerHTML =
      '<div class="dlg-topo"><h2>' + esc(h.cliente || 'Orçamento') + '</h2><span class="muted">' + dataBR(h.criadoEm) + '</span></div>' +
      '<div class="dlg-corpo"><div class="doc" style="padding:12px"><table><thead><tr><th>Sabor</th><th class="r">Qtd.</th><th class="r">Valor</th></tr></thead><tbody>' + linhas +
      '</tbody><tfoot><tr class="total"><td colspan="2">Total</td><td class="r">' + brl(h.total) + '</td></tr></tfoot></table></div>' +
      '<span class="dica">Os valores são os de quando você salvou o orçamento.</span></div>' +
      '<div class="dlg-base"><div class="linha-botoes"><button class="btn" data-act="hist-pdf" data-id="' + h.id + '">Enviar PDF</button>' +
      '<button class="btn sec" data-act="hist-share" data-id="' + h.id + '">Enviar texto</button></div>' +
      '<button class="btn sec pequeno bloco" data-act="hist-refazer" data-id="' + h.id + '">Refazer com os preços de hoje</button>' +
      '<div class="linha-botoes"><button class="btn sec pequeno" data-act="fechar">Fechar</button>' +
      '<button class="btn perigo pequeno" data-act="hist-excluir" data-id="' + h.id + '">Excluir</button></div></div>';
    abrirDlg('orcsalvo');
  }

  /* ---------- Backup ---------- */
  function exportar() {
    var json = JSON.stringify(S, null, 2);
    var nome = 'pipocas-da-mel-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    var arquivo;
    try { arquivo = new File([json], nome, { type: 'application/json' }); } catch (e) { arquivo = null; }
    if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      navigator.share({ files: [arquivo], title: 'Backup Pipocas da Mel' }).catch(function () { });
      return;
    }
    var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    aviso('Backup gerado.');
  }

  function importar(arquivo) {
    var leitor = new FileReader();
    leitor.onload = function () {
      try {
        var d = JSON.parse(leitor.result);
        if (!d || !Array.isArray(d.ingredientes) || !Array.isArray(d.sabores)) throw new Error('formato');
        if (!confirm('Importar este backup? Os dados atuais deste aparelho serão substituídos.')) return;
        S = mesclar(padrao(), d);
        if (SY.url) {
          var agora = Date.now();
          ['ingredientes', 'sabores', 'historico'].forEach(function (c) { S[c].forEach(function (r) { r.atualizado = agora; }); });
          if (S.ajustes.atualizado) S.ajustes.atualizado = agora;
          enfileirarTudo(); agendarSync();
        }
        salvar(); renderTudo(); aviso('Backup importado.');
      } catch (e) {
        aviso('Esse arquivo não parece um backup do app.');
      }
    };
    leitor.readAsText(arquivo);
  }

  /* ---------- Render geral e eventos ---------- */
  function renderTudo() {
    renderIng(); renderSab(); renderOrc(); renderTab(); renderSet();
    mostrarSync();
  }

  document.addEventListener('click', function (e) {
    var go = e.target.closest('[data-go]');
    if (go) { ir(go.dataset.go); return; }
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.dataset.act;
    var i = b.dataset.i != null ? +b.dataset.i : null;
    switch (act) {
      case 'novo-ing': abrirIng(null); break;
      case 'edit-ing': abrirIng(b.dataset.id); break;
      case 'salvar-ing': salvarIng(); break;
      case 'excluir-ing': excluirIng(); break;
      case 'novo-sab': abrirSab(null); break;
      case 'edit-sab': abrirSab(b.dataset.id); break;
      case 'salvar-sab': salvarSab(); break;
      case 'dup-sab': duplicarSab(); break;
      case 'excluir-sab': excluirSab(); break;
      case 'fechar': fecharDlg(); break;
      case 'add-item':
        rascunho.itens.push({ ingId: '', qtdTxt: '' });
        $('#sab-itens').innerHTML = itensSabHtml(); atualizarSubItens(); break;
      case 'rm-item':
        rascunho.itens.splice(i, 1);
        if (!rascunho.itens.length) rascunho.itens.push({ ingId: '', qtdTxt: '' });
        $('#sab-itens').innerHTML = itensSabHtml(); atualizarPainelSab(); break;
      case 'add-linha':
        S.orcamento.linhas.push({ id: uid(), saborId: '', qtd: 0, un: 'pct' });
        salvar(); $('#orc-linhas').innerHTML = linhasOrcHtml(); atualizarResumoOrc(); break;
      case 'rm-linha':
        S.orcamento.linhas.splice(i, 1);
        salvar(); $('#orc-linhas').innerHTML = linhasOrcHtml(); atualizarResumoOrc(); break;
      case 'orc-limpar':
        if (confirm('Limpar o pedido atual?')) { S.orcamento = { cliente: '', linhas: [] }; salvar(); renderOrc(); }
        break;
      case 'orc-pdf': entregarPDF(dadosOrcamento()); break;
      case 'orc-share': enviarTexto(textoOrcamento()); break;
      case 'tab-pdf': entregarPDF(dadosTabela()); break;
      case 'tab-share': enviarTexto(textoTabela()); break;
      case 'orc-aba': orcAba = b.dataset.aba; renderOrc(); break;
      case 'orc-salvar': {
        var foto = snapshotOrcamento();
        if (!foto.itens.length) { aviso('Escolha pelo menos um sabor e a quantidade.'); break; }
        S.historico.push(foto); marcar('historico', foto);
        S.orcamento = { cliente: '', linhas: [] }; orcAba = 'salvos';
        salvar(); renderOrc(); aviso('Orçamento salvo.');
        break;
      }
      case 'ver-orc': abrirOrcSalvo(b.dataset.id); break;
      case 'hist-pdf': { var hp = S.historico.find(function (x) { return x.id === b.dataset.id; }); if (hp) entregarPDF(dadosOrcamento(hp)); break; }
      case 'hist-share': { var hs = S.historico.find(function (x) { return x.id === b.dataset.id; }); if (hs) enviarTexto(textoOrcamento(hs)); break; }
      case 'hist-refazer': {
        var hr = S.historico.find(function (x) { return x.id === b.dataset.id; });
        if (!hr) break;
        S.orcamento = {
          cliente: hr.cliente,
          linhas: hr.linhas.filter(function (l) { return saborPorId(l.saborId); }).map(function (l) { return { id: uid(), saborId: l.saborId, qtd: l.qtd, un: l.un }; })
        };
        fecharDlg(); orcAba = 'novo'; salvar(); renderOrc(); ir('orc'); aviso('Pedido carregado com os preços de hoje.');
        break;
      }
      case 'hist-excluir': {
        var he = S.historico.find(function (x) { return x.id === b.dataset.id; });
        if (he && confirm('Excluir este orçamento salvo?')) {
          S.historico = S.historico.filter(function (x) { return x.id !== he.id; });
          marcarExcluido('historico', he.id);
          salvar(); fecharDlg(); renderOrc(); aviso('Orçamento excluído.');
        }
        break;
      }
      case 'sync-conectar': {
        var u = ($('#sy-url').value || '').trim(), sn = ($('#sy-senha').value || '').trim();
        if (!/^https:\/\/script\.google\.com\/(a\/macros\/[^\/]+\/|macros\/)s\/[^\s]+\/exec$/.test(u)) { aviso('Esse endereço não parece o do aplicativo da web (termina em /exec).'); break; }
        if (!sn) { aviso('Digite a senha que você definiu no script.'); break; }
        SY = { url: u, senha: sn, versao: 0, pendentes: [], ultimo: 0, erro: '' };
        enfileirarTudo(); renderSet();
        sincronizar().then(function () { renderSet(); aviso(SY.erro || 'Conectado e sincronizado.'); });
        break;
      }
      case 'sync-agora': sincronizar().then(function () { renderSet(); aviso(SY.erro || 'Sincronizado.'); }); break;
      case 'sync-desconectar':
        if (confirm('Desconectar da planilha? Os dados continuam neste aparelho e na planilha.')) { SY = syPadrao(); salvarSY(); renderSet(); mostrarSync(); aviso('Desconectado.'); }
        break;
      case 'exportar': exportar(); break;
      case 'importar': $('#arq-imp').click(); break;
      case 'apagar':
        if (confirm('Apagar TODOS os ingredientes, sabores, orçamentos e ajustes?' + (SY.url ? '\nComo a planilha está conectada, isso apaga também na planilha e nos outros aparelhos.' : '')) && confirm('Tem certeza? Isso não dá para desfazer.')) {
          if (SY.url) {
            ['ingredientes', 'sabores', 'historico'].forEach(function (c) { S[c].forEach(function (r) { marcarExcluido(c, r.id); }); });
          }
          S = padrao(); salvar(); renderTudo(); aviso('Dados apagados.');
        }
        break;
    }
  });

  // Digitação nos diálogos, no orçamento e nos ajustes
  function aoMudar(e) {
    var el = e.target;
    // Diálogo
    if (tipoDlg && dlg.contains(el)) {
      if (el.dataset.f) {
        rascunho[el.dataset.f] = el.value;
        if (tipoDlg === 'ing') { var p = $('#f-previa'); if (p) p.textContent = previaIng(); }
        else if (tipoDlg === 'sab') atualizarPainelSab();
      } else if (el.dataset.item) {
        var idx = +el.dataset.i;
        rascunho.itens[idx][el.dataset.item] = el.value;
        if (el.dataset.item === 'ingId' && e.type === 'change') { $('#sab-itens').innerHTML = itensSabHtml(); }
        atualizarPainelSab();
      }
      return;
    }
    // Orçamento
    if (el.id === 'orc-cliente') { S.orcamento.cliente = el.value; salvar(); return; }
    if (el.dataset.orc) {
      var l = S.orcamento.linhas[+el.dataset.i];
      if (!l) return;
      l[el.dataset.orc] = el.dataset.orc === 'qtd' ? num(el.value) : el.value;
      salvar(); atualizarResumoOrc();
      return;
    }
    // Ajustes
    if (el.dataset.aj) {
      var k = el.dataset.aj;
      if (k === 'margem') S.ajustes.margem = Math.max(0, Math.min(95, num(el.value)));
      else if (k === 'arredondar') S.ajustes.arredondar = parseFloat(el.value) || 0;
      else S.ajustes[k] = el.value;
      marcarAjustes();
      salvar();
      if (e.type === 'change') { renderSab(); renderTab(); renderOrc(); }
    }
  }
  document.addEventListener('input', aoMudar);
  document.addEventListener('change', aoMudar);

  document.addEventListener('change', function (e) {
    if (e.target.id === 'arq-imp' && e.target.files[0]) {
      importar(e.target.files[0]);
      e.target.value = '';
    }
  });

  /* ---------- Início ---------- */
  renderTudo();
  ir('ing');
  preparar();
  iniciarSync();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    });
  }

  // Exposto só para testes automáticos
  window.PGM = {
    estado: function () { return S; },
    custoUn: custoUn, custoSabor: custoSabor, analise: analise, calcOrcamento: calcOrcamento, num: num,
    docTabela: docTabela, textoOrcamento: textoOrcamento, textoTabela: textoTabela,
    renderTudo: renderTudo, ir: ir, salvar: salvar,
    preparar: preparar, montarPDF: montarPDF, dadosTabela: dadosTabela, dadosOrcamento: dadosOrcamento,
    snapshotOrcamento: snapshotOrcamento, sincronizar: sincronizar, sy: function () { return SY; }
  };
})();
