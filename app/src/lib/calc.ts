// Tiny calculator for the amount keypad: + − × ÷ with normal precedence.
// Expressions are stored with ASCII operators ("12.5+3*2") and displayed with
// typographic ones.

export const OPS = { '+': '+', '-': '−', '*': '×', '/': '÷' } as const;

export type Op = keyof typeof OPS;

export const isOp = (c: string): c is Op => c in OPS;

/** Evaluate an expression; a trailing operator is ignored. Returns NaN if invalid. */
export function evaluate(expr: string): number {
  const s = expr.replace(/[-+*/]$/, '');
  if (!s) return NaN;
  const tokens = s.match(/\d+\.?\d*|\.\d+|[-+*/]/g);
  if (!tokens || tokens.join('') !== s) return NaN;

  // First pass: × and ÷. Second pass: + and −.
  const terms = [parseFloat(tokens[0])];
  const addOps: string[] = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = parseFloat(tokens[i + 1]);
    if (op === '*') terms.push(terms.pop()! * n);
    else if (op === '/') terms.push(terms.pop()! / n);
    else {
      addOps.push(op);
      terms.push(n);
    }
  }
  let result = terms[0];
  addOps.forEach((op, i) => { result = op === '+' ? result + terms[i + 1] : result - terms[i + 1]; });
  return Number.isFinite(result) ? result : NaN;
}

export function hasOperator(expr: string): boolean {
  return /[-+*/]/.test(expr.replace(/[-+*/]$/, ''));
}

/** Apply one keypad key (digit, '.', operator or 'back') to an expression. Returns the new expression. */
export function press(expr: string, key: string): string {
  const last = expr.at(-1) ?? '';
  const current = expr.split(/[-+*/]/).at(-1) ?? '';

  if (key === 'back') return expr.slice(0, -1);
  if (isOp(key)) {
    if (!expr) return expr;
    return isOp(last) ? expr.slice(0, -1) + key : expr + key;
  }
  if (key === '.') {
    if (current.includes('.')) return expr;
    return expr + (current === '' ? '0.' : '.');
  }
  // Digit
  if (current.length >= 15) return expr;
  if (current === '0') return expr.slice(0, -1) + key;
  return expr + key;
}

/** Expression with spaced, typographic operators, e.g. "1200 + 35.5". */
export function display(expr: string): string {
  return expr.replace(/[-+*/]/g, (op) => ` ${OPS[op as Op]} `).trim();
}
