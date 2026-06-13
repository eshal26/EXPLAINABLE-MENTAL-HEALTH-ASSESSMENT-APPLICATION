const SESSION_KEY = "neuroXplain_sessions";
const THEME_KEY = "neuroXplain_theme";
const AUTH_KEY = "neuroXplain_auth";

export function loadAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export function saveAuth(auth) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

export function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

export function saveSessions(sessions) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
}

export function upsertSession(session) {
  const existing = loadSessions();
  const next = [session, ...existing.filter((item) => item.id !== session.id)];
  saveSessions(next);
  return next;
}

export function deleteSession(sessionId) {
  const next = loadSessions().filter((session) => session.id !== sessionId);
  saveSessions(next);
  return next;
}

export function clearSessions() {
  saveSessions([]);
  return [];
}

export function loadTheme() {
  return localStorage.getItem(THEME_KEY) || "light";
}

export function saveTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}
