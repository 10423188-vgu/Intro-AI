// ── Particles ────────────────────────────────────────────────────
const cvs = document.getElementById('particles');
const cx = cvs.getContext('2d');

function resize() { cvs.width = innerWidth; cvs.height = innerHeight; }
resize(); addEventListener('resize', resize);

const pts = Array.from({ length: 55 }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    r: Math.random() * 1.2 + 0.4,
    vx: (Math.random() - .5) * .25,
    vy: (Math.random() - .5) * .25,
    o: Math.random() * .4 + .15
}));

(function loop() {
    cx.clearRect(0, 0, cvs.width, cvs.height);
    pts.forEach(p => {
        cx.beginPath();
        cx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        cx.fillStyle = `rgba(184,134,11,${p.o})`;
        cx.fill();
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > innerWidth) p.vx *= -1;
        if (p.y < 0 || p.y > innerHeight) p.vy *= -1;
    });
    requestAnimationFrame(loop);
})();

// ── GSAP Animations ──────────────────────────────────────────────
gsap.registerPlugin(ScrollTrigger);

// Hero entrance
gsap.set(['#badge','#h1','#hero-p','#hero-btns'], { y: 28, opacity: 0 });

const tl = gsap.timeline({ delay: .25 });
tl.to('#badge',     { y: 0, opacity: 1, duration: .55, ease: 'power3.out' })
  .to('#h1',        { y: 0, opacity: 1, duration: .65, ease: 'power3.out' }, '-=.3')
  .to('#hero-p',    { y: 0, opacity: 1, duration: .55, ease: 'power3.out' }, '-=.35')
  .to('#hero-btns', { y: 0, opacity: 1, duration: .5,  ease: 'power3.out' }, '-=.3')
  .to('#scroll-hint', { opacity: 1, duration: .4 }, '-=.1');

// Feature cards
gsap.utils.toArray('.feature-card').forEach((card, i) => {
    gsap.to(card, {
        scrollTrigger: { trigger: card, start: 'top 88%' },
        y: 0, opacity: 1, duration: .6, delay: i * .08, ease: 'power2.out'
    });
});

// Chat box
gsap.to('#chat-wrap', {
    scrollTrigger: { trigger: '#chat-wrap', start: 'top 82%' },
    y: 0, opacity: 1, duration: .7, ease: 'power2.out'
});

// ── Chat logic ───────────────────────────────────────────────────
const API = 'http://localhost:8000/query';
let mode = 'mix', busy = false;

document.querySelectorAll('.mode-btn').forEach(b => {
    b.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        mode = b.dataset.mode;
    });
});

const inp = document.getElementById('inp');
inp.addEventListener('input', () => {
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 110) + 'px';
});
inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
document.getElementById('send').addEventListener('click', send);

function addMsg(role, html) {
    const msgs = document.getElementById('msgs');
    const w = msgs.querySelector('.welcome');
    if (w) w.remove();

    const el = document.createElement('div');
    el.className = `msg ${role}`;
    el.innerHTML = `
        <div class="msg-av">${role === 'ai' ? '🤖' : '👤'}</div>
        <div class="msg-text">${html}</div>`;
    msgs.appendChild(el);

    gsap.to(el, { opacity: 1, y: 0, duration: .35, ease: 'power2.out' });
    msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
    const msgs = document.getElementById('msgs');
    const el = document.createElement('div');
    el.className = 'msg ai'; el.id = 'typing';
    el.innerHTML = `
        <div class="msg-av">🤖</div>
        <div class="msg-text">
            <div class="typing-dots"><span></span><span></span><span></span></div>
        </div>`;
    msgs.appendChild(el);
    gsap.to(el, { opacity: 1, y: 0, duration: .3 });
    msgs.scrollTop = msgs.scrollHeight;
}

function hideTyping() {
    const t = document.getElementById('typing');
    if (t) t.remove();
}

function md(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/### (.*?)(\n|$)/g, '<h3>$1</h3>')
        .replace(/## (.*?)(\n|$)/g, '<h2>$1</h2>')
        .replace(/\n- /g, '<br>• ')
        .replace(/\n/g, '<br>');
}

async function send() {
    const q = inp.value.trim();
    if (!q || busy) return;

    busy = true;
    inp.value = ''; inp.style.height = 'auto';
    document.getElementById('send').disabled = true;

    addMsg('user', md(q));
    showTyping();

    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: q, mode, top_k: 5 })
        });
        const data = await res.json();
        hideTyping();
        addMsg('ai', res.ok ? md(data.answer) : `⚠️ ${data.detail || 'Error'}`);
    } catch {
        hideTyping();
        addMsg('ai', '⚠️ Cannot connect to API. Make sure the server is running on <code>localhost:8000</code>.');
    }

    busy = false;
    document.getElementById('send').disabled = false;
    inp.focus();
}
