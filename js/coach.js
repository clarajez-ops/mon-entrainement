// Moteur de suggestions : analyse les séances réalisées et propose la prochaine sortie course.
const Coach = (() => {
  const RUN_TYPES = {
    ef: 'Endurance fondamentale',
    classique: 'Footing classique',
    fractionne: 'Fractionné / VMA',
    seuil: 'Seuil / Tempo',
    longue: 'Sortie longue',
    recup: 'Récupération',
    competition: 'Compétition',
  };
  const QUALITY = ['fractionne', 'seuil', 'competition'];
  const RIEGEL = 1.06;

  const isRun = s => s.sport === 'course';
  const hasRunData = s => s.done && s.result && s.result.distance > 0 && s.result.duration > 0;

  function isHard(s, hrMax) {
    if (!s.done) return false;
    if (s.sport === 'basket') return true;
    if (isRun(s) && QUALITY.includes(s.runType)) return true;
    const r = s.result || {};
    if (r.rpe >= 8) return true;
    return !!(r.hrAvg && hrMax && r.hrAvg >= 0.85 * hrMax);
  }

  // Temps prédit sur `toKm` à partir d'une perf `sec` sur `fromKm` (formule de Riegel).
  const riegel = (sec, fromKm, toKm) => sec * Math.pow(toKm / fromKm, RIEGEL);

  function analyze(sessions, settings, today = new Date()) {
    const todayIso = Util.iso(today);
    const past = sessions.filter(s => s.done && s.date <= todayIso).sort((a, b) => a.date.localeCompare(b.date));
    const runs = past.filter(s => isRun(s) && hasRunData(s));
    const ago = s => Util.daysBetween(Util.parse(s.date), today);

    // --- FC max ---
    const observedMax = Math.max(0, ...past.map(s => (s.result && s.result.hrMax) || 0));
    let hrMax = null, hrMaxSource = '';
    if (settings.hrMax) { hrMax = +settings.hrMax; hrMaxSource = 'saisie'; }
    else if (observedMax >= 160) { hrMax = observedMax; hrMaxSource = 'max relevée'; }
    else if (settings.age) { hrMax = Math.round(208 - 0.7 * settings.age); hrMaxSource = 'estimée (âge)'; }
    const hrRest = settings.hrRest ? +settings.hrRest : null;

    // Avec FC repos : méthode de Karvonen (% de réserve). Sinon : % de FC max.
    const hrAt = pct => hrRest ? Math.round(hrRest + pct * (hrMax - hrRest)) : Math.round(pct * hrMax);
    const bounds = hrRest ? [0.5, 0.6, 0.7, 0.8, 0.9] : [0.55, 0.65, 0.75, 0.85, 0.92];
    const names = ['Récupération', 'Endurance fondamentale', 'Tempo / marathon', 'Seuil', 'VMA'];
    const zones = hrMax ? names.map((name, i) => ({
      z: `Z${i + 1}`, name, lo: hrAt(bounds[i]), hi: i < 4 ? hrAt(bounds[i + 1]) : hrMax,
    })) : null;

    // --- Niveau : meilleure perf "équivalent 10 km" sur 90 jours ---
    let best = null;
    for (const s of runs) {
      if (ago(s) > 90 || s.result.distance < 3) continue;
      const t10 = riegel(s.result.duration, s.result.distance, 10);
      if (!best || t10 < best.t10) best = { t10, session: s };
    }
    const p10 = best ? best.t10 / 10 : null; // s/km
    const paces = p10 ? {
      recup: p10 * 1.38,
      efLo: p10 * 1.22,
      efHi: p10 * 1.32,
      tempo: p10 * 1.1,
      seuil: p10 * 1.04,
      vma: p10 * 0.9,
    } : null;
    const predictions = best ? [5, 10, 21.0975, 42.195].map(d => ({ d, t: riegel(best.t10, 10, d) })) : [];

    // --- Volume hebdo (8 dernières semaines, semaine en cours incluse) ---
    const thisMonday = Util.monday(today);
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const start = Util.addDays(thisMonday, -7 * i);
      const end = Util.addDays(start, 7);
      const inWeek = runs.filter(s => { const d = Util.parse(s.date); return d >= start && d < end; });
      weeks.push({ start, km: inWeek.reduce((a, s) => a + s.result.distance, 0), count: inWeek.length });
    }
    const prev4 = weeks.slice(3, 7);
    const avgWeek = prev4.reduce((a, w) => a + w.km, 0) / 4;
    const level = avgWeek < 15 ? 'debutant' : avgWeek < 35 ? 'intermediaire' : 'confirme';

    // --- Contexte récent ---
    const runs28 = runs.filter(s => ago(s) <= 28);
    const avgDist = runs28.length ? runs28.reduce((a, s) => a + s.result.distance, 0) / runs28.length : 0;
    const longest30 = Math.max(0, ...runs.filter(s => ago(s) <= 30).map(s => s.result.distance));
    const lastHard = [...past].reverse().find(s => isHard(s, hrMax));
    const daysSinceHard = lastHard ? ago(lastHard) : Infinity;
    const lastQuality = [...past].reverse().find(s => isRun(s) && QUALITY.includes(s.runType));
    const daysSinceQuality = lastQuality ? ago(lastQuality) : Infinity;
    const longRunRecent = runs.some(s => ago(s) <= 7 && (s.runType === 'longue' || s.result.distance >= Math.max(10, avgDist * 1.4)));
    const runs14 = runs.filter(s => ago(s) <= 14).length;

    const ctx = { paces, zones, level, avgWeek, longest30, hrMax };

    // --- Choix de la séance recommandée ---
    let mainType, why;
    if (daysSinceHard <= 1) {
      mainType = daysSinceHard === 0 ? 'recup' : 'ef';
      why = lastHard.sport === 'basket'
        ? 'Tu as fait du basket très récemment : on reste en aisance pour bien récupérer.'
        : 'Ta dernière séance était intense : place à une sortie facile.';
    } else if (runs14 < 2) {
      mainType = 'ef';
      why = 'Peu de sorties ces 2 dernières semaines : on (re)construit d\'abord une base d\'endurance.';
    } else if (daysSinceQuality >= 4) {
      mainType = lastQuality && lastQuality.runType === 'fractionne' ? 'seuil' : 'fractionne';
      why = daysSinceQuality === Infinity
        ? 'Aucune séance de qualité enregistrée : un peu d\'intensité va te faire progresser.'
        : `Dernière séance de qualité il y a ${daysSinceQuality} jours : tu es prêt·e à en refaire une.`;
    } else if (!longRunRecent) {
      mainType = 'longue';
      why = 'Pas de sortie longue cette semaine : c\'est la base pour l\'endurance.';
    } else {
      mainType = 'ef';
      why = 'Ta semaine contient déjà qualité et sortie longue : on accumule du volume facile (règle 80/20).';
    }

    const build = { ef: buildEF, recup: buildRecup, fractionne: buildVMA, seuil: buildSeuil, longue: buildLongue };
    const recommended = { ...build[mainType](ctx), why };
    const altTypes = ['ef', 'fractionne', 'seuil', 'longue'].filter(t => t !== mainType).slice(0, 3);
    const alternatives = altTypes.map(t => build[t](ctx));

    // --- Conseils ---
    const tips = [];
    if (!paces) tips.push('Fais une course d\'au moins 3 km à allure soutenue (ou synchronise Strava) pour calibrer tes allures.');
    if (!hrMax) tips.push('Renseigne ton âge ou ta FC max dans les réglages pour obtenir tes zones cardiaques.');
    if (zones) {
      const ef30 = runs.filter(s => ago(s) <= 30 && ['ef', 'recup'].includes(s.runType) && s.result.hrAvg);
      const tooFast = ef30.filter(s => s.result.hrAvg > zones[1].hi);
      if (ef30.length >= 2 && tooFast.length / ef30.length >= 0.5) {
        tips.push(`Tes footings EF sont souvent trop rapides (FC moy. au-dessus de ${zones[1].hi} bpm). Ralentis : c'est en restant en Z2 que tu développes l'endurance.`);
      }
    }
    const thisWeek = weeks[7].km;
    if (avgWeek > 0) {
      const target = avgWeek * 1.1;
      tips.push(thisWeek > target
        ? `Volume cette semaine : ${Util.km(thisWeek)} km, au-delà des +10 % recommandés (${Util.km(target)} km). Attention aux blessures.`
        : `Volume cette semaine : ${Util.km(thisWeek)} km. Objectif raisonnable : jusqu'à ${Util.km(target)} km (+10 % max par rapport à ta moyenne).`);
    }
    const hardThisWeek = past.filter(s => ago(s) <= 7 && isHard(s, hrMax)).length;
    if (hardThisWeek >= 3) tips.push(`${hardThisWeek} séances intenses sur 7 jours (basket compris) : garde au moins 80 % de ton volume en endurance facile.`);

    return { recommended, alternatives, tips, zones, hrMax, hrMaxSource, paces, predictions, best, weeks, avgWeek, level };
  }

  // ---------- Constructeurs de séances ----------
  const P = Util.pace;

  function efTarget(ctx) {
    const parts = [];
    if (ctx.paces) parts.push(`${P(ctx.paces.efLo).replace('/km', '')}–${P(ctx.paces.efHi)}`);
    if (ctx.zones) parts.push(`FC ${ctx.zones[1].lo}–${ctx.zones[1].hi} bpm`);
    return parts.length ? parts.join(' · ') : 'allure où tu peux parler facilement';
  }

  function buildEF(ctx) {
    const min = { debutant: 35, intermediaire: 45, confirme: 55 }[ctx.level];
    return {
      runType: 'ef',
      title: `Footing EF ${min} min`,
      plannedDuration: min,
      plannedDistance: ctx.paces ? Math.round(min * 60 / ((ctx.paces.efLo + ctx.paces.efHi) / 2) * 10) / 10 : null,
      details: [`${min} min en endurance fondamentale`, `Cible : ${efTarget(ctx)}`],
      plan: `${min}' EF (${efTarget(ctx)})`,
    };
  }

  function buildRecup(ctx) {
    const target = [ctx.paces && `≥ ${P(ctx.paces.recup)}`, ctx.zones && `FC < ${ctx.zones[0].hi} bpm`].filter(Boolean).join(' · ') || 'très lent, souffle totalement libre';
    return {
      runType: 'recup',
      title: 'Footing récupération 30 min',
      plannedDuration: 30,
      plannedDistance: ctx.paces ? Math.round(1800 / ctx.paces.recup * 10) / 10 : null,
      details: ['30 min très facile, sur terrain plat si possible', `Cible : ${target}`, 'Option : remplacer par du repos ou des étirements'],
      plan: `30' récup (${target})`,
    };
  }

  function buildVMA(ctx) {
    const vma = ctx.paces && ctx.paces.vma;
    const zone = ctx.zones ? ` · FC ${ctx.zones[4].lo}+ bpm` : '';
    let block, reps, totalMin;
    if (ctx.level === 'debutant') {
      block = '8 × 30" rapide / 30" trot';
      reps = vma ? `30" à ${P(vma)} (≈ ${Math.round(30 / vma * 1000)} m)` : '30" à allure très soutenue (~90 % de ton max)';
      totalMin = 40;
    } else if (ctx.level === 'intermediaire') {
      block = '10 × 400 m, récup 1\'15 trot';
      reps = vma ? `400 m en ${Util.formatDuration(vma * 0.4)} (${P(vma)})` : '400 m vite mais réguliers';
      totalMin = 50;
    } else {
      block = '6 × 800 m, récup 2\' trot';
      reps = vma ? `800 m en ${Util.formatDuration(vma * 0.8 * 1.03)} (${P(vma * 1.03)})` : '800 m à allure 3-5 km';
      totalMin = 60;
    }
    return {
      runType: 'fractionne',
      title: `Fractionné VMA : ${block.split(',')[0]}`,
      plannedDuration: totalMin,
      plannedDistance: null,
      details: ['Échauffement 20 min EF + 3 accélérations progressives', `Corps : ${block}`, `Répétitions : ${reps}${zone}`, 'Retour au calme 10 min très lent'],
      plan: `20' EF + ${block} (${reps}) + 10' RAC`,
    };
  }

  function buildSeuil(ctx) {
    const s = ctx.paces && ctx.paces.seuil;
    const zone = ctx.zones ? `FC ${ctx.zones[3].lo}–${ctx.zones[3].hi} bpm` : '';
    const block = { debutant: '3 × 6 min, récup 2\'', intermediaire: '3 × 10 min, récup 2\'', confirme: '2 × 15 min, récup 3\'' }[ctx.level];
    const target = [s && P(s), zone].filter(Boolean).join(' · ') || 'allure « confortablement difficile »';
    return {
      runType: 'seuil',
      title: `Seuil : ${block.split(',')[0]}`,
      plannedDuration: { debutant: 50, intermediaire: 60, confirme: 65 }[ctx.level],
      plannedDistance: null,
      details: ['Échauffement 20 min EF', `Corps : ${block}`, `Cible : ${target}`, 'Retour au calme 10 min'],
      plan: `20' EF + ${block} (${target}) + 10' RAC`,
    };
  }

  function buildLongue(ctx) {
    const base = ctx.longest30 || 8;
    const cap = ctx.avgWeek ? Math.max(8, ctx.avgWeek * 0.45) : 10;
    const km = Math.round(Math.max(6, Math.min(base * 1.1, cap)));
    const sec = ctx.paces ? km * ctx.paces.efHi : null;
    return {
      runType: 'longue',
      title: `Sortie longue ${km} km`,
      plannedDuration: sec ? Math.round(sec / 60) : null,
      plannedDistance: km,
      details: [`${km} km${sec ? ` (≈ ${Util.formatDuration(sec)})` : ''} en endurance`, `Cible : ${efTarget(ctx)}`, 'Hydrate-toi si plus d\'1 h'],
      plan: `${km} km sortie longue (${efTarget(ctx)})`,
    };
  }

  return { analyze, RUN_TYPES };
})();
