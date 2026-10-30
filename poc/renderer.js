const el = id => document.getElementById(id);
let state = { connected: false, models: [] };
let working = false;
function render() {
  el('account').textContent = state.connected ? `Connected: ${state.account}${state.planEnabled ? ' · Plan usage authorized' : ' · Plan usage not authorized'}` : 'No account connected';
  for (const id of ['login', 'disconnect', 'models', 'test', 'model']) el(id).disabled = working;
  el('cancel').hidden = !working;
  el('disconnect').disabled ||= !state.connected;
  el('models').disabled ||= !state.connected || !state.planEnabled;
  el('test').disabled ||= !state.connected || !state.models.length;
  el('model').disabled ||= !state.models.length;
  const selected = el('model').value;
  el('model').replaceChildren();
  for (const model of state.models) el('model').add(new Option(model.display_name, model.slug));
  if (!state.models.length) el('model').add(new Option('Connect to load models', ''));
  if (state.models.some(m => m.slug === selected)) el('model').value = selected;
}
function status(text, className = '') { el('status').textContent = text; el('status').className = className; }
async function command(action, value) {
  if (working && action !== 'cancel') return;
  if (action !== 'status' && action !== 'cancel') { working = true; render(); }
  try {
    const result = await window.studyflow.command(action, value);
    if (result.data) state = result.data;
    if (!result.ok) status(result.error, 'error');
    else if (action === 'test') status('Connection verified. A real streamed lesson completed using your ChatGPT plan.', 'success');
  } catch { status('The desktop connection failed. Restart StudyFlow and try again.', 'error'); }
  finally { if (action !== 'cancel') working = false; render(); }
}
window.studyflow.onEvent(event => {
  if (event.kind === 'delta') el('output').textContent += event.text;
  else if (event.kind === 'status') status(event.text);
});
el('login').onclick = () => command('login');
el('disconnect').onclick = () => command('disconnect');
el('models').onclick = () => command('models');
el('cancel').onclick = () => command('cancel');
el('test').onclick = () => {
  el('output').textContent = '';
  status('Streaming a real lesson. Waiting for response.completed…');
  command('test', el('model').value);
};
command('status').then(() => { if (state.connected) command('models'); });
