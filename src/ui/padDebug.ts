import { choosePad, layoutFor } from '../input/padLayout';

/** Live dump of every gamepad the browser exposes. Enabled with `?debug=pad`. */
export function startPadDebug(container: HTMLElement): void {
  const pre = document.createElement('pre');
  pre.className = 'pad-debug';
  container.appendChild(pre);
  const tick = () => {
    const pads = navigator.getGamepads?.() ?? [];
    const chosen = choosePad(pads);
    const lines = [
      `secure context: ${window.isSecureContext}  getGamepads: ${'getGamepads' in navigator}`,
    ];
    if (!pads.some(Boolean)) lines.push('no pads visible — press a button on the controller');
    for (const p of pads) {
      if (!p) continue;
      const pressed = p.buttons.flatMap((b, i) => (b.pressed ? [i] : []));
      lines.push(
        `${p === chosen ? '▶' : ' '} [${p.index}] ${p.id}`,
        `    mapping="${p.mapping}" layout=${layoutFor(p).name}`,
        `    axes ${p.axes.map((a) => a.toFixed(2)).join(' ')}`,
        `    pressed [${pressed.join(', ')}] of ${p.buttons.length}`,
      );
    }
    pre.textContent = lines.join('\n');
    requestAnimationFrame(tick);
  };
  tick();
}
