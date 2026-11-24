// Skins (themes). Load this in <head>, before the stylesheets finish, so the page never
// flashes the wrong look. The choice is kept on this device; the host's skin is also sent
// to the players (host.js → play.js), so the whole party shares the host's look.
// Every <div data-skin-cards> on the page becomes the "Pick your mood" chooser.
(function (G) {
  const KEY = 'meca-skin', DEF = 'pista';
  const SKINS = {
    pista: { en: 'Dance floor', color: '#0e0b1f',
      n: { es: 'Pista de baile', fr: 'Piste de danse', de: 'Tanzfläche', it: 'Pista da ballo', nl: 'Dansvloer', pl: 'Parkiet', sk: 'Tanečný parket' },
      d: { en: 'Neon lights and a mirror ball', es: 'Luces de neón y bola de espejos', fr: 'Néons et boule à facettes', de: 'Neonlicht und Discokugel', it: 'Luci al neon e palla stroboscopica', nl: 'Neonlicht en een discobal', pl: 'Neony i kula dyskotekowa', sk: 'Neóny a disko guľa' } },
    verbena: { en: 'Street party', color: '#f3ebdd',
      n: { es: 'Verbena', fr: 'Bal populaire', de: 'Straßenfest', it: 'Festa di paese', nl: 'Buurtfeest', pl: 'Potańcówka', sk: 'Ľudová zábava' },
      d: { en: 'Paper card and red stamp', es: 'Papel y sello rojo', fr: 'Papier et tampon rouge', de: 'Papier und roter Stempel', it: 'Carta e timbro rosso', nl: 'Papier en rode stempel', pl: 'Papier i czerwona pieczątka', sk: 'Papier a červená pečiatka' } },
    feria: { en: 'Flamenco fair', color: '#fff6ec',
      n: { es: 'Feria flamenca', fr: 'Feria flamenca', de: 'Flamenco-Fest', it: 'Festa flamenca', nl: 'Flamencofeest', pl: 'Fiesta flamenco', sk: 'Flamenková slávnosť' },
      d: { en: 'Polka dots, ruffles and lanterns', es: 'Lunares, volantes y farolillos', fr: 'Pois, volants et lampions', de: 'Punkte, Volants und Lampions', it: 'Pois, volant e lanterne', nl: 'Stippen, volants en lampionnen', pl: 'Grochy, falbany i lampiony', sk: 'Bodky, volány a lampióny' } },
    mesa: { en: 'Board game', color: '#ede7ff',
      n: { es: 'Juego de mesa', fr: 'Jeu de société', de: 'Brettspiel', it: 'Gioco da tavolo', nl: 'Bordspel', pl: 'Gra planszowa', sk: 'Spoločenská hra' },
      d: { en: 'Cobalt and lime, like a game box', es: 'Cobalto y lima, como una caja de juego', fr: 'Cobalt et citron vert, comme une boîte de jeu', de: 'Kobalt und Limette wie eine Spieleschachtel', it: 'Cobalto e lime, come una scatola di gioco', nl: 'Kobalt en limoen, zoals een spellendoos', pl: 'Kobalt i limonka jak pudełko z grą', sk: 'Kobalt a limetka ako krabica hry' } },
    clasico: { en: 'Classic', color: '#0d0b1a',
      n: { es: 'Clásico', fr: 'Classique', de: 'Klassisch', it: 'Classico', nl: 'Klassiek', pl: 'Klasyczny', sk: 'Klasický' },
      d: { en: 'The original Meca Bingo', es: 'El Meca Bingo de siempre', fr: 'Le Meca Bingo d’origine', de: 'Das Original-Meca-Bingo', it: 'Il Meca Bingo di sempre', nl: 'De originele Meca Bingo', pl: 'Oryginalne Meca Bingo', sk: 'Pôvodné Meca Bingo' } }
  };
  const nameOf = (k, l) => SKINS[k].n[l] || SKINS[k].en;
  const TXT = {
    en: { lang: 'Language', menu: 'Language', mood: 'Pick your mood', moodLead: 'Change the look. Your players see the same one on their phones.' },
    es: { lang: 'Idioma', menu: 'Idioma', mood: 'Escoge tu mood', moodLead: 'Cambia el estilo. Tus jugadores verán el mismo en su móvil.' },
    fr: { lang: 'Langue', menu: 'Langue', mood: 'Choisis ton mood', moodLead: 'Change le look. Tes joueurs voient le même sur leur téléphone.' },
    de: { lang: 'Sprache', menu: 'Sprache', mood: 'Wähl deinen Mood', moodLead: 'Ändere den Look. Deine Mitspieler sehen denselben auf ihrem Handy.' },
    it: { lang: 'Lingua', menu: 'Lingua', mood: 'Scegli il tuo mood', moodLead: 'Cambia lo stile. I tuoi giocatori vedono lo stesso sul telefono.' },
    nl: { lang: 'Taal', menu: 'Taal', mood: 'Kies je mood', moodLead: 'Verander de stijl. Je spelers zien dezelfde op hun telefoon.' },
    pl: { lang: 'Język', menu: 'Język', mood: 'Wybierz swój mood', moodLead: 'Zmień styl. Twoi gracze zobaczą ten sam na swoich telefonach.' },
    sk: { lang: 'Jazyk', menu: 'Jazyk', mood: 'Vyber si svoj mood', moodLead: 'Zmeň štýl. Tvoji hráči uvidia rovnaký vo svojich mobiloch.' }
  };
  const root = document.documentElement;
  const valid = s => Object.prototype.hasOwnProperty.call(SKINS, s);
  const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const lang = () => { const l = (root.lang || 'en').slice(0, 2); return TXT[l] ? l : 'en'; };

  // landing screenshots: <img data-skin-img="host"> shows /img/skins/<skin>/host.(webp|jpg)
  // (made by tools/site/screenshots.py; the default skin's are also /img/host.*)
  function pictures(s) {
    document.querySelectorAll('img[data-skin-img]').forEach(img => {
      const n = img.dataset.skinImg, src = s === DEF ? `/img/${n}` : `/img/skins/${s}/${n}`;
      const webp = img.parentElement.tagName === 'PICTURE' && img.parentElement.querySelector('source[type="image/webp"]');
      if (webp) webp.srcset = src + '.webp';
      img.src = src + '.jpg';
    });
  }
  function pressed(s) {
    document.querySelectorAll('[data-skin-cards] button[data-skin]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.skin === s)));
  }
  function apply(s) {
    if (!valid(s)) s = DEF;
    root.dataset.skin = s;
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = SKINS[s].color;
    pictures(s); pressed(s);
    return s;
  }
  // save = false: show a skin without changing this device's choice (players following the host)
  function set(s, save = true) {
    s = apply(s);
    if (save) try { localStorage.setItem(KEY, s); } catch (e) {}
    G.dispatchEvent(new CustomEvent('skinchange', { detail: s }));
    return s;
  }
  // texts, the language menu and the mood cards (again when the page changes language)
  function draw() {
    const l = lang(), t = TXT[l];
    document.querySelectorAll('[data-prefs-t]').forEach(el => { if (t[el.dataset.prefsT]) el.textContent = t[el.dataset.prefsT]; });
    document.querySelectorAll('[data-prefs-label]').forEach(el => { el.textContent = '🌐 ' + l.toUpperCase(); el.setAttribute('aria-label', t.menu); el.title = t.menu; });
    document.querySelectorAll('[data-skin-cards]').forEach(box => {
      box.setAttribute('role', 'group'); box.setAttribute('aria-label', t.mood);
      box.innerHTML = Object.keys(SKINS).map(k => `<button type="button" data-skin="${k}" aria-pressed="false">` +
        `<span class="mthumb" data-k="${k}"><img src="/img/skins/${k}/player.webp" alt="" loading="lazy" width="390" height="760"></span>` +
        `<b>${nameOf(k, l)}</b><small>${SKINS[k].d[l] || SKINS[k].d.en}</small></button>`).join('');
      if (!box.dataset.bound) { box.dataset.bound = '1'; box.addEventListener('click', e => { const b = e.target.closest('button[data-skin]'); if (b) set(b.dataset.skin); }); }
    });
    pressed(root.dataset.skin);
  }

  apply(read());
  // close the language menu on a click outside it or on Escape
  document.addEventListener('click', e => document.querySelectorAll('details.prefs[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('details.prefs[open]').forEach(d => { d.open = false; d.querySelector('summary').focus(); }); });
  // string of paper lanterns on top of the page; css/skins.css only shows it in the "feria" skin
  function lanterns() {
    if (document.querySelector('.faroles')) return;
    const small = !!document.getElementById('board');          // the player's phone: shorter string
    document.body.insertAdjacentHTML('afterbegin', `<div class="faroles${small ? ' small' : ''}" aria-hidden="true">${'<i></i>'.repeat(14)}</div>`);
  }
  const ready = () => { lanterns(); draw(); pictures(root.dataset.skin); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  new MutationObserver(draw).observe(root, { attributes: true, attributeFilter: ['lang'] });

  G.Skin = { list: Object.keys(SKINS), get: () => root.dataset.skin, set, valid, refresh: draw };
})(window);
