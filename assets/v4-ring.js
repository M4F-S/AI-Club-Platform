/* ================================================================
   V4 JOIN RING — activation ring + apply form (home only)
   ================================================================ */
(() => {
  const form = document.getElementById('join-form');
  if (!form) return;
  const C = 2 * Math.PI * 54, SEG = C / 4 - 6;
  const num = document.getElementById('rc-num');
  const submitBtn = document.getElementById('join-submit');

  function syncRing() {
    let filled = 0;
    form.querySelectorAll('.jfield').forEach(f => {
      const input = f.querySelector('input,textarea');
      const seg = document.getElementById('seg-' + f.dataset.seg);
      const on = input.value.trim().length > 0;
      f.classList.toggle('filled', on);
      if (seg) {
        seg.style.strokeDasharray = on ? `${SEG} 999` : '0 999';
        seg.classList.toggle('lit', on);
      }
      if (on) filled++;
    });
    if (num) num.textContent = Math.round(filled / 4 * 100) + '%';
    submitBtn?.classList.toggle('armed', filled === 4);
  }
  form.addEventListener('input', syncRing);

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = n => form.querySelector(`[data-seg="${n}"] input, [data-seg="${n}"] textarea`).value.trim();
    const succ = document.getElementById('j-success');
    try {
      const r = await fetch('/api/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f(0), email: f(1), intra_username: f(2), message: f(3) }),
      });
      const ring = document.querySelector('.ring-box')?.getBoundingClientRect();
      if (r.ok || r.status === 202 || r.status === 201) {
        if (ring) window.emitRipples?.(ring.left + ring.width / 2, ring.top + ring.height / 2, 4, 200);
        form.style.display = 'none';
        succ.querySelector('h3').textContent = '◉ Node connected';
        succ.querySelector('p').textContent = 'Application received. The network will review your signal — check your inbox within ~48 hours.';
        succ.classList.add('show');
      } else {
        const d = await r.json().catch(() => ({}));
        succ.querySelector('h3').textContent = '◍ Not sent';
        succ.querySelector('p').textContent = d.error || 'Something went wrong — please try again.';
        succ.classList.add('show');
      }
    } catch (err) {
      succ.querySelector('h3').textContent = '◍ Offline';
      succ.querySelector('p').textContent = 'Network error — please try again shortly.';
      succ.classList.add('show');
    }
  });
})();
