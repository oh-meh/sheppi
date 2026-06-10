import type { Terminal } from "@xterm/xterm";

export function preserveTerminalViewport(term: Terminal, update: () => void) {
  const before = term.buffer.active;
  const bottomOffset = Math.max(0, before.baseY - before.viewportY);

  update();

  if (bottomOffset === 0) {
    term.scrollToBottom();
    return;
  }

  const after = term.buffer.active;
  term.scrollToLine(Math.max(0, after.baseY - bottomOffset));
}
