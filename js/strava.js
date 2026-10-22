// Connexion Strava (OAuth) et import des activités.
// L'ID et le secret client sont ceux de TON application Strava ; ils restent sur ton téléphone.
const Strava = (() => {
  const API = 'https://www.strava.com/api/v3';
  const redirectUri = () => location.origin + location.pathname;

  const SPORT_MAP = {
    Run: 'course', TrailRun: 'course', VirtualRun: 'course',
    Basketball: 'basket',
    WeightTraining: 'renfo', Workout: 'renfo', Crossfit: 'renfo', HighIntensityIntervalTraining: 'renfo',
  };

  function isConfigured() {
    const s = Store.settings();
    return !!(s.stravaClientId && s.stravaClientSecret);
  }
  const isConnected = () => !!Store.settings().stravaRefresh;

  function connect() {
    const s = Store.settings();
    const url = new URL('https://www.strava.com/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: s.stravaClientId,
      response_type: 'code',
      redirect_uri: redirectUri(),
      approval_prompt: 'auto',
      scope: 'activity:read_all',
    });
    location.href = url.toString();
  }

  async function tokenRequest(params) {
    const s = Store.settings();
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: s.stravaClientId, client_secret: s.stravaClientSecret, ...params }),
    });
    if (!res.ok) throw new Error(`Strava a refusé l'authentification (${res.status})`);
    const data = await res.json();
    Store.saveSettings({
      stravaAccess: data.access_token,
      stravaRefresh: data.refresh_token,
      stravaExpires: data.expires_at,
    });
    return data;
  }

  // Appelé au démarrage : traite le retour ?code=... de Strava.
  async function handleCallback() {
    const params = new URLSearchParams(location.search);
    if (!params.has('code') && !params.has('error')) return null;
    history.replaceState(null, '', redirectUri());
    if (params.has('error')) throw new Error('Connexion Strava annulée');
    const data = await tokenRequest({ code: params.get('code'), grant_type: 'authorization_code' });
    return data;
  }

  async function accessToken() {
    const s = Store.settings();
    if (s.stravaAccess && s.stravaExpires > Date.now() / 1000 + 60) return s.stravaAccess;
    if (!s.stravaRefresh) throw new Error('Pas connecté à Strava');
    const data = await tokenRequest({ refresh_token: s.stravaRefresh, grant_type: 'refresh_token' });
    return data.access_token;
  }

  function guessRunType(a) {
    if (a.workout_type === 1) return 'competition';
    if (a.workout_type === 2) return 'longue';
    if (a.workout_type === 3) return 'fractionne';
    return 'classique';
  }

  function toResult(a, previous = {}) {
    return {
      ...previous,
      distance: a.distance ? Math.round(a.distance / 10) / 100 : previous.distance,
      duration: a.moving_time || previous.duration,
      hrAvg: a.average_heartrate ? Math.round(a.average_heartrate) : previous.hrAvg,
      hrMax: a.max_heartrate ? Math.round(a.max_heartrate) : previous.hrMax,
      notes: previous.notes || a.name,
    };
  }

  async function sync() {
    const token = await accessToken();
    const s = Store.settings();
    const now = Math.floor(Date.now() / 1000);
    const after = s.lastSync ? s.lastSync - 3 * 86400 : now - 120 * 86400;

    const activities = [];
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(`${API}/athlete/activities?after=${after}&per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 429) throw new Error('Limite Strava atteinte, réessaie dans 15 min');
      if (!res.ok) throw new Error(`Erreur Strava (${res.status})`);
      const batch = await res.json();
      activities.push(...batch);
      if (batch.length < 100) break;
    }

    let added = 0, updated = 0;
    for (const a of activities) {
      const sport = SPORT_MAP[a.sport_type] || SPORT_MAP[a.type];
      if (!sport) continue;
      const date = a.start_date_local.slice(0, 10);
      const time = a.start_date_local.slice(11, 16);
      const sessions = Store.sessions();

      let existing = sessions.find(x => x.stravaId === a.id);
      // Sinon, rattacher à une séance planifiée du même jour et du même sport.
      if (!existing) existing = sessions.find(x => !x.stravaId && !x.done && x.date === date && x.sport === sport);

      if (existing) {
        Store.saveSession({ ...existing, stravaId: a.id, done: true, time: existing.time || time, result: toResult(a, existing.result) });
        updated++;
      } else {
        Store.saveSession({
          date, time, sport,
          runType: sport === 'course' ? guessRunType(a) : null,
          plan: '',
          done: true,
          stravaId: a.id,
          result: toResult(a),
        });
        added++;
      }
    }
    Store.saveSettings({ lastSync: now });
    return { added, updated };
  }

  function disconnect() {
    Store.saveSettings({ stravaAccess: null, stravaRefresh: null, stravaExpires: null, lastSync: null });
  }

  return { isConfigured, isConnected, connect, handleCallback, sync, disconnect, redirectUri };
})();
