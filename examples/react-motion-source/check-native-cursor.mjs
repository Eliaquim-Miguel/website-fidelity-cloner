/** Non-destructive cursor smoke test in a fresh Chrome CDP tab. */
const endpoint = 'http://127.0.0.1:9335';
const page = await fetch(endpoint + '/json/new?about:blank', { method: 'PUT' }).then(r => r.json());
const socket = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const ready = new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
socket.addEventListener('message', event => {
  const data = JSON.parse(event.data);
  if (!data.id || !pending.has(data.id)) return;
  const { resolve, reject } = pending.get(data.id);
  pending.delete(data.id);
  if (data.error) reject(new Error(data.error.message));
  else resolve(data.result);
});
async function send(method, params = {}) {
  await ready;
  const seq = ++id;
  return new Promise((resolve, reject) => {
    pending.set(seq, { resolve, reject });
    socket.send(JSON.stringify({ id: seq, method, params }));
  });
}
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:4318/' });
  await new Promise(resolve => setTimeout(resolve, 2400));
  const data = await send('Runtime.evaluate', {
    expression: `(() => {
      const names = {
        html: document.documentElement, body: document.body,
        landing: document.querySelector('[data-ulls-landing]'),
        heading: document.querySelector('h1'),
        anchor: document.querySelector('header a[href]') || document.querySelector('a[href]'),
        button: document.querySelector('button'),
        input: document.querySelector('input'),
        sidebar: document.querySelector('[data-ulls-dashboard-sidebar]')
      };
      return Object.fromEntries(Object.entries(names).map(([name,el]) =>
        [name, el ? getComputedStyle(el).cursor : null]
      ));
    })()`,
    returnByValue: true,
  });
  if (data.exceptionDetails) throw new Error(data.exceptionDetails.text);
  const cursors = data.result.value;
  console.log(JSON.stringify(cursors, null, 2));
  if (['html', 'body', 'landing', 'heading'].some(name => cursors[name] !== 'auto')) {
    throw new Error('O cursor SVG da Kirvano ainda está ativo.');
  }
  if (cursors.anchor !== 'pointer' || cursors.button !== 'pointer') {
    throw new Error('O cursor nativo de links/botões não foi preservado.');
  }
  if (cursors.sidebar && cursors.sidebar !== 'default' && cursors.sidebar !== 'auto') {
    throw new Error('A sidebar ilustrativa não está neutra.');
  }
  console.log('PASSOU: cursores nativos e nenhum cursor personalizado ativo.');
} finally {
  socket.close();
  await fetch(endpoint + '/json/close/' + page.id).catch(() => {});
}
