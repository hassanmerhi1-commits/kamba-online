// The internal order slip printed at the office when a customer orders.
// It is used as the reference for buying the products from the twin company. It is NOT a tax invoice.

export const SLIP_WIDTH = 48; // characters on an 80 mm roll (standard font)

const PAYMENT = { cash: 'Dinheiro', transfer: 'Transferência bancária', multicaixa: 'Multicaixa', other: 'Outro' };

export function money(n) {
  const fixed = Number.isInteger(n) ? String(n) : n.toFixed(2);
  const [int, dec] = fixed.split('.');
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}${dec ? `,${dec}` : ''} Kz`;
}

const pad2 = (n) => String(n).padStart(2, '0');
export function dateTime(iso) {
  const d = new Date(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Break text into lines of at most `width` characters, never cutting a word unless it is longer than a line. */
export function wrap(text, width) {
  const out = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = '';
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      while (word.length > width) {
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

/** Left text and right text on one line, the right one flush with the edge. */
export function row(left, right, width = SLIP_WIDTH) {
  const gap = width - left.length - right.length;
  if (gap >= 1) return left + ' '.repeat(gap) + right;
  return `${left.slice(0, Math.max(0, width - right.length - 1))} ${right}`;
}

/**
 * @param {object} order  order with items (product_id, product_name, quantity, unit_price)
 * @param {{ title?: string, skus?: Record<string,string>, allocations?: {product_id:string, shop_name:string, quantity:number}[], test?: boolean }} opts
 * @returns {{ text: string, align?: 'left'|'center'|'right', bold?: boolean, big?: boolean }[]}
 */
export function buildSlip(order, { title = 'Kamba Online', skus = {}, allocations = [], test = false } = {}) {
  const W = SLIP_WIDTH;
  const lines = [];
  const add = (text, style = {}) => lines.push({ text, ...style });
  const addWrapped = (text, style = {}, width = W) => wrap(text, width).forEach((t) => add(t, style));
  const rule = (ch = '-') => add(ch.repeat(W));

  addWrapped(title.toUpperCase(), { align: 'center', bold: true, big: true }, W / 2);
  add(test ? 'TESTE DE IMPRESSAO' : 'NOVA ENCOMENDA', { align: 'center', bold: true });
  rule('=');

  add(`Encomenda: ${order.id}`, { bold: true });
  add(`Data: ${dateTime(order.created_at)}`);
  rule();

  addWrapped(`Cliente: ${order.customer_name}`, { bold: true });
  addWrapped(`Telefone: ${order.customer_phone}`);
  if (order.fulfillment_type === 'delivery') {
    add('ENTREGA', { bold: true });
    addWrapped(order.delivery_address ?? '', {});
  } else {
    add('LEVANTAMENTO NO ESCRITORIO', { bold: true });
  }
  add(`Pagamento: ${PAYMENT[order.payment_method] ?? order.payment_method}`);
  rule();

  for (const item of order.items) {
    addWrapped(`${item.quantity} x ${item.product_name}`, { bold: true });
    const sku = skus[item.product_id];
    const detail = `${sku ? `${sku}  ` : ''}${money(item.unit_price)} /un`;
    add(row(`   ${detail}`, money(item.unit_price * item.quantity)));
  }
  rule();
  add(row('TOTAL', money(order.total)), { bold: true });
  rule();

  if (allocations.length) {
    add('STOCK TIRADO DE:', { bold: true });
    for (const item of order.items) {
      const from = allocations.filter((a) => a.product_id === item.product_id);
      if (!from.length) continue;
      addWrapped(item.product_name, {});
      for (const a of from) add(row(`   ${a.shop_name}`, `${a.quantity} un`));
    }
    rule();
  }

  if (order.notes) {
    add('NOTAS:', { bold: true });
    addWrapped(order.notes);
    rule();
  }

  add('Documento interno - sem valor fiscal', { align: 'center' });
  return lines;
}

/** Plain text version (used by tests and as a preview). */
export function slipToText(lines, width = SLIP_WIDTH) {
  return lines
    .map(({ text, align }) => {
      if (align === 'center') return ' '.repeat(Math.max(0, Math.floor((width - text.length) / 2))) + text;
      if (align === 'right') return ' '.repeat(Math.max(0, width - text.length)) + text;
      return text;
    })
    .join('\n');
}

// ---------- ESC/POS (the language XPrinter and most receipt printers speak) ----------

// Characters outside plain ASCII that Portuguese needs, in code page 850.
const CP850 = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, à: 0x85, ç: 0x87, ê: 0x88, á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3,
  ñ: 0xa4, Á: 0xb5, Â: 0xb6, À: 0xb7, ã: 0xc6, Ã: 0xc7, Ê: 0xd2, É: 0x90, Í: 0xd6, Ó: 0xe0, Ô: 0xe2,
  Õ: 0xe5, õ: 0xe4, Ú: 0xe9, ô: 0x93, è: 0x8a, ë: 0x89, î: 0x8c, ì: 0x8d, ò: 0x95, ù: 0x97, Ñ: 0xa5,
};
const REPLACEMENTS = { '—': '-', '–': '-', '×': 'x', '‘': "'", '’': "'", '“': '"', '”': '"', '•': '*', '…': '...', '\u00a0': ' ', '\u202f': ' ' };

export function encode850(text) {
  const bytes = [];
  for (const ch of text.normalize('NFC')) {
    const c = REPLACEMENTS[ch] ?? ch;
    for (const s of c) {
      const code = s.codePointAt(0);
      if (code === 0x0a) bytes.push(0x0a);
      else if (code >= 0x20 && code < 0x7f) bytes.push(code);
      else if (CP850[s] !== undefined) bytes.push(CP850[s]);
      else bytes.push(0x3f); // "?"
    }
  }
  return Buffer.from(bytes);
}

const ESC = 0x1b;
const GS = 0x1d;
const ALIGN = { left: 0, center: 1, right: 2 };

export function toEscPos(lines, { cut = true } = {}) {
  const parts = [Buffer.from([ESC, 0x40]), Buffer.from([ESC, 0x74, 0x02])]; // init, code page 850
  for (const { text, align = 'left', bold = false, big = false } of lines) {
    parts.push(Buffer.from([ESC, 0x61, ALIGN[align]]));
    parts.push(Buffer.from([ESC, 0x45, bold ? 1 : 0]));
    parts.push(Buffer.from([GS, 0x21, big ? 0x11 : 0x00]));
    parts.push(encode850(text), Buffer.from([0x0a]));
  }
  parts.push(Buffer.from([ESC, 0x61, 0, ESC, 0x45, 0, GS, 0x21, 0])); // back to normal
  parts.push(Buffer.from([ESC, 0x64, 4])); // feed 4 lines so the text clears the cutter
  if (cut) parts.push(Buffer.from([GS, 0x56, 0x42, 0x00])); // feed to cut position, then partial cut
  return Buffer.concat(parts);
}
