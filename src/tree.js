// Lösungsbaum: Blätter (geschätzte Faktoren) und Operationen.
// leaf: { kind:'leaf', id, label, value, unit, reasonType, reason, slot }
// op:   { kind:'op', id, op:'mul'|'div'|'add'|'sub'|'segment_sum', children:[...] , segments?:[] }

import { dimOf, mulDim, sameDim, toBase } from './units.js';

let counter = 0;
export const newId = () => 'n' + Date.now().toString(36) + (counter++).toString(36);

export const newLeaf = () => ({ kind: 'leaf', id: newId(), label: '', value: null, unit: 'zahl', reasonType: '', reason: '', slot: '' });
export const newOp = (op = 'mul', children) => ({ kind: 'op', id: newId(), op, children: children || [newLeaf(), newLeaf()] });

export const OPS = {
  mul: { de: '× multiplizieren', sym: '×' },
  div: { de: '÷ dividieren', sym: '÷' },
  add: { de: '+ addieren', sym: '+' },
  sub: { de: '− subtrahieren', sym: '−' },
  segment_sum: { de: 'Σ Segmente summieren', sym: 'Σ' },
};

// Wertet den Baum aus. Gibt { value (Basis), dim, errors[] } zurück.
export function evaluate(node) {
  const errors = [];
  const res = walk(node, errors);
  return { value: res.value, dim: res.dim, errors };
}

function walk(node, errors) {
  if (node.kind === 'leaf') {
    if (!(typeof node.value === 'number' && isFinite(node.value))) {
      errors.push({ id: node.id, msg: `«${node.label || 'Faktor'}» hat keinen Wert` });
      return { value: NaN, dim: dimOf(node.unit) };
    }
    return { value: toBase(node.value, node.unit), dim: dimOf(node.unit) };
  }
  const kids = node.children.map(c => walk(c, errors));
  if (kids.length < 2) errors.push({ id: node.id, msg: 'Eine Operation braucht mindestens zwei Elemente' });
  const [first, ...rest] = kids;
  let value = first.value, dim = first.dim;
  for (const k of rest) {
    switch (node.op) {
      case 'mul': value *= k.value; dim = mulDim(dim, k.dim, 1); break;
      case 'div': value /= k.value; dim = mulDim(dim, k.dim, -1); break;
      case 'add': case 'segment_sum': case 'sub':
        if (!sameDim(dim, k.dim)) errors.push({ id: node.id, msg: `Einheiten passen nicht zusammen bei ${OPS[node.op].sym}`, unit: true });
        value = node.op === 'sub' ? value - k.value : value + k.value;
        break;
    }
  }
  return { value, dim };
}

export function leaves(node, out = []) {
  if (!node) return out;
  if (node.kind === 'leaf') out.push(node);
  else node.children.forEach(c => leaves(c, out));
  return out;
}

export function ops(node, out = []) {
  if (!node || node.kind === 'leaf') return out;
  out.push(node);
  node.children.forEach(c => ops(c, out));
  return out;
}

export function findParent(root, id, parent = null) {
  if (root.id === id) return parent;
  if (root.kind === 'op') for (const c of root.children) {
    const p = findParent(c, id, root);
    if (p !== undefined) return p;
  }
  return undefined;
}

// Ersetzt Knoten mit id durch replacement (immutabel genug für einen Prototyp: in-place)
export function replaceNode(root, id, replacement) {
  if (root.id === id) return replacement;
  const parent = findParent(root, id);
  if (parent) parent.children = parent.children.map(c => (c.id === id ? replacement : c));
  return root;
}

export function removeNode(root, id) {
  const parent = findParent(root, id);
  if (!parent) return root;
  parent.children = parent.children.filter(c => c.id !== id);
  if (parent.children.length === 1) return replaceNode(root, parent.id, parent.children[0]);
  return root;
}
