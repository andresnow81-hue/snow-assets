/**
 * Abertura demanda Marketing · BV Group
 * Recebe o formulário público e cria o card no Trello (quadro MARKETING, lista NOVAS SOLICITAÇÕES).
 *
 * Configuração (uma vez): Configurações do projeto (engrenagem) > Propriedades do script >
 *   TRELLO_KEY   = sua API key do Trello
 *   TRELLO_TOKEN = seu token do Trello
 * Depois: Implantar > Nova implantação > Tipo "App da Web" > Executar como "Eu" > Quem pode acessar "Qualquer pessoa".
 */

const LISTA = '6a9713e8e06bd754cbe81233'; // NOVAS SOLICITAÇÕES
const ETIQUETAS = {
  'Snow': '6467aaa6591cd8a3eaf11ea9',
  'Primus': '6467aaa6591cd8a3eaf11eb4',
  'Azul Viagens': '5bc77ff0a724a908c00f36e1',
  'BV Group': '5ea7107db7399c26fd9d03d9'
};
const ETIQUETA_URGENTE = '652d5bc9cdf6bad3cc0bbc3c'; // PRIORIDADE
const AVISO_VERBA = 'andre@bvgroup.com.br';

const TIPOS = ['Peça nova', 'Ajuste em peça existente', 'Campanha ou ação'];
const PECAS = ['Post feed', 'Story / Reels', 'WhatsApp', 'E-mail marketing', 'Banner do site', 'Lâmina de oferta', 'Apresentação', 'Impresso para loja', 'Vídeo', 'Outro'];
const COMS = ['Cliente', 'Interna'];
const OBJS = ['Vender um produto ou destino', 'Divulgar promoção ou campanha', 'Engajar agentes', 'Evento', 'Marca / institucional', 'Comunicado'];
const VERBAS = ['Não', 'Sim, mídia paga', 'Sim, gráfica ou brinde', 'Não sei'];
const PRIORIDADES = ['Normal', 'Alta', 'Urgente'];

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function txt(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max || 500); }
function lista(v, permitidos) { return (Array.isArray(v) ? v : []).filter(function (x) { return permitidos.indexOf(x) > -1; }); }
function um(v, permitidos, padrao) { return permitidos.indexOf(v) > -1 ? v : (padrao || ''); }

function doGet() { return resposta({ ok: true, servico: 'Abertura demanda Marketing' }); }

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.site) return resposta({ ok: true }); // robô

    // Limite simples: no máximo 60 pedidos por hora no total.
    const cache = CacheService.getScriptCache();
    const n = Number(cache.get('contador') || 0);
    if (n >= 60) return resposta({ ok: false, message: 'Muitos envios nesta hora. Tente de novo mais tarde.' });
    cache.put('contador', String(n + 1), 3600);

    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty('TRELLO_KEY'), token = props.getProperty('TRELLO_TOKEN');
    if (!key || !token) return resposta({ ok: false, message: 'O formulário ainda não foi ligado ao Trello. Avise o André.' });

    const empresas = lista(d.empresas, Object.keys(ETIQUETAS));
    const pecas = lista(d.pecas, PECAS);
    const tipo = um(d.tipo, TIPOS), com = um(d.comunicacao, COMS), obj = um(d.objetivo, OBJS), verba = um(d.verba, VERBAS, 'Não');
    const nome = txt(d.nome, 120), email = txt(d.email, 160), titulo = txt(d.titulo, 120), mensagem = txt(d.mensagem, 200);
    const prioridade = um(d.prioridade, PRIORIDADES, 'Normal');
    const infos = txt(d.infos, 4000), urgente = d.urgente === true || prioridade === 'Urgente', urgencia = txt(d.urgencia, 1000);
    const prazo = /^\d{4}-\d{2}-\d{2}$/.test(d.prazo || '') ? d.prazo : '';
    const anexos = /^https?:\/\/\S+$/.test(txt(d.anexos, 1000)) ? txt(d.anexos, 1000) : '';

    if (!empresas.length || !pecas.length || !tipo || !com || !obj || !nome || !/^\S+@\S+\.\S+$/.test(email) || !titulo || !prazo || !mensagem || !infos) {
      return resposta({ ok: false, message: 'Faltam campos obrigatórios. Confira o formulário.' });
    }
    if (urgente && !urgencia) return resposta({ ok: false, message: 'Explique por que o pedido é urgente.' });

    const prazoBr = prazo.split('-').reverse().join('/');
    const nomeCard = '[' + empresas.join(' + ').toUpperCase() + '] ' + titulo + (verba !== 'Não' ? ' · VERBA (aprovação André)' : '');
    const l = [
      '**Mensagem principal:** ' + mensagem,
      '**Empresa:** ' + empresas.join(', '),
      '**Tipo:** ' + tipo,
      '**Peças:** ' + pecas.join(', '),
      '**Comunicação:** ' + com,
      '**Objetivo:** ' + obj,
      '**Data desejada:** ' + prazoBr + ' (a data de entrega é definida na triagem)',
      '**Prioridade:** ' + prioridade
    ];
    if (urgente) l.push('**URGENTE:** ' + urgencia);
    l.push('**Verba / fornecedor externo:** ' + verba, '', '**Informações obrigatórias:**', infos);
    if (anexos) l.push('', '**Anexos:** ' + anexos);
    l.push('', '_Pedido por ' + nome + ' (' + email + ') em ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm') + ', via formulário público._');

    const etiquetas = empresas.map(function (x) { return ETIQUETAS[x]; });
    if (urgente) etiquetas.push(ETIQUETA_URGENTE);

    const r = UrlFetchApp.fetch('https://api.trello.com/1/cards', {
      method: 'post',
      muteHttpExceptions: true,
      payload: {
        key: key, token: token, idList: LISTA, pos: 'top',
        name: nomeCard, desc: l.join('\n'), idLabels: etiquetas.join(',')
      }
    });
    const code = r.getResponseCode();
    if (code < 200 || code >= 300) {
      console.error('Trello ' + code + ': ' + r.getContentText());
      return resposta({ ok: false, message: 'O Trello recusou o pedido (erro ' + code + '). Avise o André.' });
    }
    const card = JSON.parse(r.getContentText());
    const url = card.shortUrl || card.url || '';

    if (verba !== 'Não') {
      MailApp.sendEmail(AVISO_VERBA, 'Aprovar verba: ' + nomeCard,
        'Novo pedido com verba ou fornecedor externo.\n\n' + nomeCard + '\nPedido por ' + nome + ' (' + email + ')\nData desejada: ' + prazoBr + ' · Prioridade: ' + prioridade + '\n\nCard: ' + url);
    }
    return resposta({ ok: true, url: url });
  } catch (err) {
    console.error(err);
    return resposta({ ok: false, message: 'Não foi possível enviar agora. Tente de novo em instantes.' });
  }
}
