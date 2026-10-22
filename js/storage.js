// Stockage local (localStorage) + petites fonctions utilitaires partagées.
const Store = (() => {
  const KEY_SESSIONS = 'me.sessions';
  const KEY_SETTINGS = 'me.settings';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Sauvegarde impossible', e);
    }
  }

  let sessions = read(KEY_SESSIONS, []);
  let settings = read(KEY_SETTINGS, {});

  return {
    sessions: () => sessions,
    settings: () => settings,

    saveSession(s) {
      if (!s.id) s.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      const i = sessions.findIndex(x => x.id === s.id);
      if (i >= 0) sessions[i] = s; else sessions.push(s);
      write(KEY_SESSIONS, sessions);
      return s;
    },

    deleteSession(id) {
      sessions = sessions.filter(s => s.id !== id);
      write(KEY_SESSIONS, sessions);
    },

    saveSettings(patch) {
      settings = { ...settings, ...patch };
      write(KEY_SETTINGS, settings);
    },

    exportData() {
      // Les identifiants Strava ne sont pas exportés.
      const { stravaClientSecret, stravaRefresh, stravaAccess, ...safeSettings } = settings;
      return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), sessions, settings: safeSettings }, null, 2);
    },

    importData(json) {
      const data = JSON.parse(json);
      if (!Array.isArray(data.sessions)) throw new Error('Fichier invalide');
      sessions = data.sessions;
      settings = { ...settings, ...(data.settings || {}) };
      write(KEY_SESSIONS, sessions);
      write(KEY_SETTINGS, settings);
    },
  };
})();

const Util = {
  // Date locale au format YYYY-MM-DD (évite les décalages UTC de toISOString).
  iso(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  parse(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  },
  daysBetween(a, b) {
    return Math.round((Util.parse(Util.iso(b)) - Util.parse(Util.iso(a))) / 86400000);
  },
  // Lundi de la semaine contenant d.
  monday(d) {
    const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
    return r;
  },
  // "1:05:30" | "45:00" | "45" (minutes) -> secondes
  parseDuration(str) {
    if (!str) return null;
    const parts = String(str).trim().split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 1) return parts[0] * 60;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  },
  formatDuration(sec) {
    if (sec == null) return '';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const p = n => String(n).padStart(2, '0');
    return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
  },
  // secondes par km -> "5:12/km"
  pace(secPerKm) {
    if (!secPerKm || !isFinite(secPerKm)) return '–';
    const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
    return s === 60 ? `${m + 1}:00/km` : `${m}:${String(s).padStart(2, '0')}/km`;
  },
  km(n) {
    return (Math.round(n * 10) / 10).toLocaleString('fr-FR');
  },
  esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
};
