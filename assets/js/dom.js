// Tiny DOM helpers shared by every view.
const Dom = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  // h('div', {class: 'x', onclick: fn}, 'text', child, [more, children])
  function build(el, attrs, children) {
    let value;
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'value') value = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.setAttribute('class', v);
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c);
    // set value last so <select> already has its options
    if (value !== undefined) el.value = value;
    return el;
  }

  const h = (tag, attrs, ...children) => build(document.createElement(tag), attrs, children);
  const svg = (tag, attrs, ...children) =>
    build(document.createElementNS('http://www.w3.org/2000/svg', tag), attrs, children);

  return { $, h, svg };
})();
