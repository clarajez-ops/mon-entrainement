// Interface : calendrier, éditeur de séance, conseils, stats, réglages.
(() => {
  const $ = sel => document.querySelector(sel);
  const ICONS = { course: '🏃', basket: '🏀', renfo: '💪' };
  const TITLES = { calendar: 'Calendrier', suggest: 'Conseils', stats: 'Statistiques', settings: 'Réglages' };

  const state = {
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    selected: Util.iso(new Date()),
    view: 'calendar',
  };

  // ---------- Helpers ----------
  function toast(msg, ms = 2500) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), ms);
  }

  function sessionTitle(s) {
    if (s.sport === 'course') return Coach.RUN_TYPES[s.runType] || 'Course';
    return s.sport === 'basket' ? 'Basket' : 'Renforcement';
  }

  function sessionSummary(s) {
    const r = s.result || {};
    const parts = [];
    if (s.time) parts.push(s.time);
    if (s.done) {
      if (r.distance) parts.push(`${Util.km(r.distance)} km`);
      if (r.duration) parts.push(Util.formatDuration(r.duration));
      if (r.distance && r.duration && s.sport === 'course') parts.push(Util.pace(r.duration / r.distance));
      if (r.hrAvg) parts.push(`♥ ${r.hrAvg}`);
    } else {
      if (s.plannedDistance) parts.push(`${Util.km(s.plannedDistance)} km`);
      if (s.plannedDuration) parts.push(`${s.plannedDuration} min`);
      if (s.plan) parts.push(s.plan);
    }
    return parts.join(' · ');
  }

  // ---------- Navigation ----------
  function showView(name) {
    state.view = name;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $('#view-title').textContent = TITLES[name];
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    ({ calendar: renderCalendar, suggest: renderSuggest, stats: renderStats, settings: renderSettings })[state.view]();
  }

  // ---------- Calendrier ----------
  function renderCalendar() {
    const m = state.month;
    $('#month-label').textContent = m.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    const byDate = {};
    for (const s of Store.sessions()) (byDate[s.date] ||= []).push(s);

    const start = Util.monday(m);
    const todayIso = Util.iso(new Date());
    const grid = $('#calendar-grid');
    grid.innerHTML = '';
    for (let i = 0; i < 42; i++) {
      const d = Util.addDays(start, i);
      if (i === 35 && d.getMonth() !== m.getMonth()) break; // 5 semaines suffisent
      const iso = Util.iso(d);
      const list = byDate[iso] || [];
      const btn = document.createElement('button');
      btn.className = 'day';
      if (d.getMonth() !== m.getMonth()) btn.classList.add('other');
      if (iso === todayIso) btn.classList.add('today');
      if (iso === state.selected) btn.classList.add('selected');
      btn.dataset.date = iso;
      btn.setAttribute('aria-label', `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}, ${list.length} séance(s)`);
      btn.innerHTML = `<span class="num">${d.getDate()}</span><span class="dots">${
        list.slice(0, 3).map(s => `<i class="dot ${s.sport}${s.done ? '' : ' planned'}"></i>`).join('')
      }</span>`;
      grid.appendChild(btn);
    }
    renderDay(byDate[state.selected] || []);
  }

  function renderDay(list) {
    const d = Util.parse(state.selected);
    $('#day-label').textContent = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const box = $('#day-sessions');
    if (!list.length) {
      box.innerHTML = '<div class="empty">Aucune séance ce jour-là</div>';
      return;
    }
    list.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    box.innerHTML = list.map(s => `
      <div class="session ${s.sport}" data-id="${s.id}">
        <span class="ico">${ICONS[s.sport]}</span>
        <div class="body">
          <div class="title">${Util.esc(sessionTitle(s))}</div>
          <div class="meta">${Util.esc(sessionSummary(s))}</div>
        </div>
        <span class="check ${s.done ? '' : 'todo'}">${s.done ? '✓ Fait' : 'Prévu'}</span>
      </div>`).join('');
  }

  // ---------- Éditeur ----------
  const dialog = $('#session-dialog');
  const form = $('#session-form');

  function syncFormVisibility() {
    const isRunSport = form.sport.value === 'course';
    form.querySelectorAll('.run-only').forEach(el => { el.style.display = isRunSport ? '' : 'none'; });
    form.querySelector('fieldset.results').disabled = !form.done.checked;
    $('#rpe-out').textContent = form.rpe.value;
  }

  function openEditor(session, date) {
    const s = session || { sport: 'course', runType: 'ef', date: date || state.selected, done: false };
    const r = s.result || {};
    form.reset();
    form.sid.value = s.id || '';
    form.sport.value = s.sport;
    form.runType.value = s.runType || 'ef';
    form.date.value = s.date;
    form.time.value = s.time || '';
    form.plannedDuration.value = s.plannedDuration ?? '';
    form.plannedDistance.value = s.plannedDistance ?? '';
    form.plan.value = s.plan || '';
    form.done.checked = !!s.done;
    form.distance.value = r.distance ?? '';
    form.duration.value = r.duration ? Util.formatDuration(r.duration) : '';
    form.hrAvg.value = r.hrAvg ?? '';
    form.hrMaxSession.value = r.hrMax ?? '';
    form.rpe.value = r.rpe ?? 5;
    form.notes.value = r.notes || '';
    $('#session-dialog-title').textContent = session ? 'Modifier' : 'Nouvelle séance';
    $('#delete-session').style.display = session ? '' : 'none';
    syncFormVisibility();
    dialog.showModal();
  }

  const num = v => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (!form.date.value) return;
    const existing = Store.sessions().find(x => x.id === form.sid.value) || {};
    const s = {
      ...existing,
      id: form.sid.value || undefined,
      sport: form.sport.value,
      runType: form.sport.value === 'course' ? form.runType.value : null,
      date: form.date.value,
      time: form.time.value,
      plannedDuration: num(form.plannedDuration.value),
      plannedDistance: form.sport.value === 'course' ? num(form.plannedDistance.value) : null,
      plan: form.plan.value.trim(),
      done: form.done.checked,
    };
    if (s.done) {
      s.result = {
        distance: form.sport.value === 'course' ? num(form.distance.value) : null,
        duration: Util.parseDuration(form.duration.value),
        hrAvg: num(form.hrAvg.value),
        hrMax: num(form.hrMaxSession.value),
        rpe: Number(form.rpe.value),
        notes: form.notes.value.trim(),
      };
    }
    Store.saveSession(s);
    state.selected = s.date;
    dialog.close();
    render();
    toast('Séance enregistrée');
  });

  form.addEventListener('input', syncFormVisibility);
  form.addEventListener('change', syncFormVisibility);
  $('#cancel-session').addEventListener('click', () => dialog.close());
  $('#delete-session').addEventListener('click', () => {
    if (!confirm('Supprimer cette séance ?')) return;
    Store.deleteSession(form.sid.value);
    dialog.close();
    render();
    toast('Séance supprimée');
  });

  // ---------- Conseils ----------
  function renderSuggest() {
    const a = Coach.analyze(Store.sessions(), Store.settings());
    const tomorrow = Util.iso(Util.addDays(new Date(), 1));
    const card = (sug, main) => `
      <div class="card suggestion ${main ? 'main' : ''}" data-sug='${Util.esc(JSON.stringify(sug))}'>
        <div class="tag">${main ? 'Recommandé' : Util.esc(Coach.RUN_TYPES[sug.runType])}</div>
        <h3>${Util.esc(sug.title)}</h3>
        ${sug.details.map(d => `<p>${Util.esc(d)}</p>`).join('')}
        ${sug.why ? `<p class="why">${Util.esc(sug.why)}</p>` : ''}
        <div class="row">
          <input type="date" value="${tomorrow}" aria-label="Date">
          <button class="btn small plan-btn">Planifier</button>
        </div>
      </div>`;

    const levelLabel = { debutant: 'Débutant·e', intermediaire: 'Intermédiaire', confirme: 'Confirmé·e' }[a.level];
    let profile = `<div class="card"><h3>Ton profil coureur</h3>
      <p class="muted small-text">Niveau : ${levelLabel} · ${Util.km(a.avgWeek)} km/sem. en moyenne</p>`;
    if (a.best) {
      const b = a.best.session;
      profile += `<p class="small-text muted">Basé sur ta course du ${Util.parse(b.date).toLocaleDateString('fr-FR')} : ${Util.km(b.result.distance)} km en ${Util.formatDuration(b.result.duration)}</p>
        <table class="zones"><tr><th>Distance</th><th>Temps estimé</th><th>Allure</th></tr>
        ${a.predictions.map(p => `<tr><td>${{ 5: '5 km', 10: '10 km', 21.0975: 'Semi', 42.195: 'Marathon' }[p.d]}</td><td>${Util.formatDuration(p.t)}</td><td>${Util.pace(p.t / p.d)}</td></tr>`).join('')}
        </table>
        <h3 style="margin-top:16px">Allures d'entraînement</h3>
        <table class="zones">
          <tr><td>Récupération</td><td>${Util.pace(a.paces.recup)}</td></tr>
          <tr><td>Endurance fondamentale</td><td>${Util.pace(a.paces.efLo).replace('/km', '')}–${Util.pace(a.paces.efHi)}</td></tr>
          <tr><td>Tempo</td><td>${Util.pace(a.paces.tempo)}</td></tr>
          <tr><td>Seuil</td><td>${Util.pace(a.paces.seuil)}</td></tr>
          <tr><td>VMA</td><td>${Util.pace(a.paces.vma)}</td></tr>
        </table>`;
    }
    if (a.zones) {
      profile += `<h3 style="margin-top:16px">Zones cardiaques</h3>
        <p class="muted small-text">FC max ${a.hrMax} bpm (${a.hrMaxSource})</p>
        <table class="zones">${a.zones.map(z => `<tr><td>${z.z}</td><td>${z.name}</td><td>${z.lo}–${z.hi}</td></tr>`).join('')}</table>`;
    }
    profile += '</div>';

    $('#suggest-content').innerHTML = `
      ${card(a.recommended, true)}
      ${a.tips.length ? `<div class="card"><h3>Conseils</h3>${a.tips.map(t => `<div class="tip">${Util.esc(t)}</div>`).join('')}</div>` : ''}
      <h3 style="margin:18px 0 8px">Autres options</h3>
      ${a.alternatives.map(s => card(s, false)).join('')}
      ${profile}`;
  }

  $('#suggest-content').addEventListener('click', e => {
    const btn = e.target.closest('.plan-btn');
    if (!btn) return;
    const cardEl = btn.closest('.suggestion');
    const sug = JSON.parse(cardEl.dataset.sug);
    const date = cardEl.querySelector('input[type="date"]').value;
    if (!date) return;
    Store.saveSession({
      sport: 'course', runType: sug.runType, date, time: '',
      plan: sug.plan, plannedDuration: sug.plannedDuration, plannedDistance: sug.plannedDistance, done: false,
    });
    toast(`Ajouté au ${Util.parse(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' })}`);
  });

  // ---------- Stats ----------
  function renderStats() {
    const sessions = Store.sessions();
    const a = Coach.analyze(sessions, Store.settings());
    const now = new Date();
    const monthPrefix = Util.iso(now).slice(0, 7);
    const doneMonth = sessions.filter(s => s.done && s.date.startsWith(monthPrefix));
    const runsMonth = doneMonth.filter(s => s.sport === 'course' && s.result && s.result.distance);
    const kmMonth = runsMonth.reduce((t, s) => t + s.result.distance, 0);
    const cutoff = Util.iso(Util.addDays(now, -30));
    const runs30 = sessions.filter(s => s.done && s.sport === 'course' && s.date >= cutoff && s.result && s.result.distance && s.result.duration);
    const d30 = runs30.reduce((t, s) => t + s.result.distance, 0);
    const t30 = runs30.reduce((t, s) => t + s.result.duration, 0);
    const hrRuns = runs30.filter(s => s.result.hrAvg);
    const hr30 = hrRuns.length ? Math.round(hrRuns.reduce((t, s) => t + s.result.hrAvg, 0) / hrRuns.length) : null;
    const count = sport => doneMonth.filter(s => s.sport === sport).length;

    const maxKm = Math.max(1, ...a.weeks.map(w => w.km));
    const bars = a.weeks.map((w, i) => `
      <div class="bar-col ${i === 7 ? 'current' : ''}" aria-label="Semaine du ${w.start.toLocaleDateString('fr-FR')} : ${Util.km(w.km)} km">
        <span class="val">${Util.km(w.km)} km</span>
        <div class="bar" style="height:${(w.km / maxKm) * 100}%"></div>
      </div>`).join('');
    const labels = a.weeks.map(w => `<span>${w.start.getDate()}/${w.start.getMonth() + 1}</span>`).join('');

    $('#stats-content').innerHTML = `
      <div class="kpis">
        <div class="kpi"><div class="v">${Util.km(kmMonth)}</div><div class="l">km courus ce mois</div></div>
        <div class="kpi"><div class="v">${runsMonth.length} · ${count('basket')} · ${count('renfo')}</div><div class="l">course · basket · renfo (mois)</div></div>
        <div class="kpi"><div class="v">${d30 ? Util.pace(t30 / d30).replace('/km', '') : '–'}</div><div class="l">allure moyenne /km (30 j)</div></div>
        <div class="kpi"><div class="v">${hr30 ?? '–'}</div><div class="l">FC moyenne course (30 j)</div></div>
      </div>
      <div class="card">
        <h3>Kilomètres par semaine</h3>
        <p class="muted small-text">Touche une barre pour voir sa valeur</p>
        <div class="bars">${bars}</div>
        <div class="bar-labels">${labels}</div>
        <details style="margin-top:12px"><summary>Voir le tableau</summary>
          <table class="zones"><tr><th>Semaine du</th><th>Sorties</th><th>km</th></tr>
          ${a.weeks.map(w => `<tr><td>${w.start.toLocaleDateString('fr-FR')}</td><td>${w.count}</td><td>${Util.km(w.km)}</td></tr>`).join('')}
          </table>
        </details>
      </div>`;
  }

  $('#stats-content').addEventListener('click', e => {
    const col = e.target.closest('.bar-col');
    if (!col) return;
    document.querySelectorAll('.bar-col.show').forEach(c => c !== col && c.classList.remove('show'));
    col.classList.toggle('show');
  });

  // ---------- Réglages ----------
  function renderSettings() {
    const s = Store.settings();
    const f = $('#settings-form');
    f.age.value = s.age || '';
    f.hrMax.value = s.hrMax || '';
    f.hrRest.value = s.hrRest || '';
    const sf = $('#strava-form');
    sf.stravaClientId.value = s.stravaClientId || '';
    sf.stravaClientSecret.value = s.stravaClientSecret || '';
    sf.stravaRefresh.value = s.stravaRefresh || '';
    $('#callback-domain').textContent = location.hostname || 'ton-pseudo.github.io';

    const connected = Strava.isConnected();
    $('#strava-status').textContent = !Strava.isConfigured()
      ? 'Non configuré.'
      : connected
        ? `Connecté.${s.lastSync ? ' Dernière synchro : ' + new Date(s.lastSync * 1000).toLocaleString('fr-FR') : ''}`
        : 'Configuré, pas encore connecté.';
    $('#strava-connect').textContent = connected ? 'Se déconnecter' : 'Se connecter à Strava';
    $('#strava-connect').disabled = !Strava.isConfigured();
    $('#strava-sync').disabled = !connected;
  }

  $('#settings-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    Store.saveSettings({ age: num(f.age.value), hrMax: num(f.hrMax.value), hrRest: num(f.hrRest.value) });
    toast('Profil enregistré');
  });

  $('#strava-form').addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    Store.saveSettings({
      stravaClientId: f.stravaClientId.value.trim(),
      stravaClientSecret: f.stravaClientSecret.value.trim(),
      stravaRefresh: f.stravaRefresh.value.trim() || null,
    });
    renderSettings();
    toast('Identifiants Strava enregistrés');
  });

  $('#strava-connect').addEventListener('click', () => {
    if (Strava.isConnected()) {
      Strava.disconnect();
      renderSettings();
      toast('Déconnecté de Strava');
    } else {
      Strava.connect();
    }
  });

  async function runSync(silent) {
    try {
      if (!silent) toast('Synchronisation…', 10000);
      const { added, updated } = await Strava.sync();
      if (!silent || added) toast(`Strava : ${added} nouvelle(s) activité(s), ${updated} mise(s) à jour`);
      render();
    } catch (err) {
      if (!silent) toast(err.message, 4000);
    }
  }
  $('#strava-sync').addEventListener('click', () => runSync(false));

  $('#export-btn').addEventListener('click', () => {
    const blob = new Blob([Store.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `entrainement-${Util.iso(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      Store.importData(await file.text());
      toast('Données importées');
      render();
    } catch (err) {
      toast('Import impossible : ' + err.message, 4000);
    }
    e.target.value = '';
  });

  // ---------- Événements calendrier ----------
  $('#prev-month').addEventListener('click', () => { state.month.setMonth(state.month.getMonth() - 1); renderCalendar(); });
  $('#next-month').addEventListener('click', () => { state.month.setMonth(state.month.getMonth() + 1); renderCalendar(); });
  $('#calendar-grid').addEventListener('click', e => {
    const day = e.target.closest('.day');
    if (!day) return;
    state.selected = day.dataset.date;
    const d = Util.parse(state.selected);
    if (d.getMonth() !== state.month.getMonth()) state.month = new Date(d.getFullYear(), d.getMonth(), 1);
    renderCalendar();
  });
  $('#day-sessions').addEventListener('click', e => {
    const el = e.target.closest('.session');
    if (el) openEditor(Store.sessions().find(s => s.id === el.dataset.id));
  });
  $('#add-on-day').addEventListener('click', () => openEditor(null, state.selected));
  document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

  // ---------- Démarrage ----------
  async function init() {
    render();
    try {
      const data = await Strava.handleCallback();
      if (data) {
        toast('Connecté à Strava !');
        // Sur iPhone, le retour de Strava peut s'ouvrir dans Safari plutôt que dans l'app
        // installée (stockage séparé) : on propose de copier le jeton pour le coller dans l'app.
        const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
        if (iOS && navigator.standalone === false) {
          prompt('Si tu utilises l\'app depuis l\'écran d\'accueil, copie ce code et colle-le dans Réglages › Strava › Refresh token :', data.refresh_token);
        }
        showView('settings');
        await runSync(false);
      }
    } catch (err) {
      toast(err.message, 4000);
    }
    const s = Store.settings();
    if (Strava.isConnected() && (!s.lastSync || Date.now() / 1000 - s.lastSync > 3600)) runSync(true);
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  init();
})();
