/**
 * Pipocas Gourmet da Mel · ponte entre o app e a planilha do Google.
 *
 * COMO USAR (resumo; o passo a passo completo está em PASSO-A-PASSO.md):
 *  1. Crie uma planilha nova no Google Planilhas.
 *  2. Extensões > Apps Script. Apague o que estiver lá e cole este arquivo inteiro.
 *  3. Troque a SENHA abaixo por uma senha sua.
 *  4. Implantar > Nova implantação > Tipo: App da Web
 *     Executar como: Eu  ·  Quem pode acessar: Qualquer pessoa
 *  5. Copie o endereço que termina em /exec e cole no app (Ajustes), com a mesma senha.
 */

// >>> TROQUE ESTA SENHA (use letras e números, sem espaços) <<<
const SENHA = 'troque-esta-senha';
const SENHA_PADRAO_DO_MODELO = 'troque-esta-senha'; // NÃO MEXA nesta linha

const CABECALHO = ['colecao', 'id', 'atualizado', 'excluido', 'versao', 'json'];

function doGet() {
  return saida_({ ok: true, mensagem: 'Pipocas da Mel: a ponte com a planilha está ativa.' });
}

function doPost(e) {
  const trava = LockService.getScriptLock();
  let travou = false;
  try {
    trava.waitLock(25000);
    travou = true;
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!SENHA || SENHA === SENHA_PADRAO_DO_MODELO || req.senha !== SENHA) {
      return saida_({ ok: false, erro: 'senha' });
    }
    return saida_(sincronizar_(req));
  } catch (err) {
    return saida_({ ok: false, erro: String((err && err.message) || err) });
  } finally {
    if (travou) trava.releaseLock();
  }
}

function saida_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function aba_(nome, cabecalho) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let a = ss.getSheetByName(nome);
  if (!a) {
    a = ss.insertSheet(nome);
    if (cabecalho) {
      a.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]);
      a.getRange('A:B').setNumberFormat('@');
      a.setFrozenRows(1);
    }
  }
  return a;
}

function registro_(l) {
  return {
    colecao: String(l[0]),
    id: String(l[1]),
    atualizado: Number(l[2]),
    excluido: Number(l[3]) === 1,
    dados: l[5] ? JSON.parse(l[5]) : null
  };
}

function sincronizar_(req) {
  const aba = aba_('Dados', CABECALHO);
  const ultima = aba.getLastRow();
  const linhas = ultima > 1 ? aba.getRange(2, 1, ultima - 1, CABECALHO.length).getValues() : [];
  const indice = {};
  linhas.forEach(function (l, i) { indice[l[0] + '|' + l[1]] = i; });

  const props = PropertiesService.getScriptProperties();
  let versao = Number(props.getProperty('versao')) || 0;
  let desde = Number(req.desde) || 0;
  if (desde > versao) desde = 0; // a planilha foi refeita: manda tudo de novo

  const mudancas = Array.isArray(req.mudancas) ? req.mudancas : [];
  const proxima = versao + 1;
  const rejeitados = [];
  let houve = false;

  mudancas.forEach(function (m) {
    if (!m || !m.colecao || !m.id) return;
    const chave = m.colecao + '|' + m.id;
    const quando = Number(m.atualizado) || 0;
    const linha = [String(m.colecao), String(m.id), quando, m.excluido ? 1 : 0, proxima, m.excluido ? '' : JSON.stringify(m.dados)];
    if (chave in indice) {
      const atual = linhas[indice[chave]];
      if (quando > Number(atual[2])) { linhas[indice[chave]] = linha; houve = true; }
      else rejeitados.push(registro_(atual)); // o que está na planilha é mais novo
    } else {
      indice[chave] = linhas.length;
      linhas.push(linha);
      houve = true;
    }
  });

  if (houve) {
    aba.getRange(2, 1, linhas.length, CABECALHO.length).setValues(linhas);
    props.setProperty('versao', String(proxima));
    versao = proxima;
    atualizarVisoes_(linhas);
  }

  const registros = [];
  linhas.forEach(function (l) { if (Number(l[4]) > desde) registros.push(registro_(l)); });
  rejeitados.forEach(function (r) { registros.push(r); });
  return { ok: true, versao: versao, registros: registros };
}

/* ---------- abas para você ler (o app não usa estas) ---------- */

function t_(s) { s = String(s == null ? '' : s); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function porNome_(a, b) { return String(a.nome).localeCompare(String(b.nome), 'pt-BR'); }

function vivos_(linhas, colecao) {
  const r = [];
  linhas.forEach(function (l) {
    if (l[0] === colecao && Number(l[3]) !== 1 && l[5]) {
      try { r.push(JSON.parse(l[5])); } catch (e) { /* ignora linha ruim */ }
    }
  });
  return r;
}

function escrever_(nome, cab, linhas) {
  const a = aba_(nome, null);
  a.clearContents();
  const todas = [cab].concat(linhas);
  a.getRange(1, 1, todas.length, cab.length).setValues(todas);
  a.setFrozenRows(1);
  a.getRange(1, 1, 1, cab.length).setFontWeight('bold');
}

function atualizarVisoes_(linhas) {
  const ings = vivos_(linhas, 'ingredientes').sort(porNome_);
  const sabs = vivos_(linhas, 'sabores').sort(porNome_);
  const hist = vivos_(linhas, 'historico').sort(function (a, b) { return b.criadoEm - a.criadoEm; });
  const nomeIng = {};
  ings.forEach(function (i) { nomeIng[i.id] = i.nome; });

  escrever_('Ingredientes',
    ['Nome', 'Medido em', 'Preço pago (R$)', 'Quantidade comprada', 'Custo por grama ou unidade (R$)'],
    ings.map(function (i) {
      return [t_(i.nome), i.tipo === 'un' ? 'unidades' : 'gramas', i.preco, i.qtd, i.qtd > 0 ? i.preco / i.qtd : 0];
    }));

  escrever_('Sabores',
    ['Sabor', 'Peso do pacote (g)', 'O que vai em cada pacote', 'Outros custos (R$)', 'Preço que vende hoje (R$)', 'Margem própria (%)'],
    sabs.map(function (s) {
      const itens = (s.itens || []).map(function (it) { return (nomeIng[it.ingId] || '?') + ' ' + it.qtd; }).join('; ');
      return [t_(s.nome), s.peso, t_(itens), s.outros || 0, s.preco || '', s.margem == null ? '' : s.margem];
    }));

  escrever_('Orçamentos',
    ['Data', 'Cliente', 'Total (R$)', 'Itens'],
    hist.map(function (h) {
      const itens = (h.itens || []).map(function (i) { return i.nome + ' · ' + i.quantidade; }).join('; ');
      return [new Date(h.criadoEm), t_(h.cliente), h.total, t_(itens)];
    }));
}
