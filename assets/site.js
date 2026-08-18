>
(function() {
  var loader = document.getElementById('loader');
  if (loader) {
    var lCount = loader.querySelector('.l-count');
    var lBar = loader.querySelector('.l-bar i');
    var p = 0;
    var t0 = performance.now();
    (function loadTick() {
      var el = performance.now() - t0;
      p = Math.min(100, Math.round((el / 1500) * 100 * (0.4 + Math.random() * 0.6)));
      if (el > 1500) p = 100;
      if (lCount) lCount.textContent = p;
      if (lBar) lBar.style.transform = 'scaleX(' + (p / 100) + ')';
      if (p < 100) requestAnimationFrame(loadTick);
      else setTimeout(function() { loader.classList.add('done'); document.body.classList.add('loaded'); }, 220);
    })();
  } else {
    document.body.classList.add('loaded');
  }
})();

>
let agentOpen = false;
function toggle(force) {
  agentOpen = typeof force === 'boolean' ? force : !agentOpen;
  document.getElementById('orb').classList.toggle('open', agentOpen);
  document.getElementById('agent-panel').classList.toggle('open', agentOpen);
}
async function ask(e) {
  e.preventDefault();
  const input = document.getElementById('agent-input');
  const msg = input.value.trim();
  if (!msg) return false;
  const box = document.getElementById('agent-messages');
  box.innerHTML += '<div class="ap-msg user">' + msg.replace(/</g,'&lt;') + '</div>';
  input.value = '';
  box.innerHTML += '<div class="ap-msg agent thinking">Thinking...</div>';
  box.scrollTop = box.scrollHeight;
  try {
    const r = await fetch('/api/agent', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({message: msg, context: 'club'})
    });
    const data = await r.json();
    box.querySelector('.thinking').outerHTML = '<div class="ap-msg agent">' + (data.reply || data.response || 'No response.') + '</div>';
  } catch(e) {
    box.querySelector('.thinking').outerHTML = '<div class="ap-msg agent">Sorry, I could not reach the server. Please try again.</div>';
  }
  box.scrollTop = box.scrollHeight;
  return false;
}

>setTimeout(function(){ document.body.classList.add("loaded"); }, 5000);

