'use strict';

const { pathToFileURL } = require('node:url');

const STATUS_VALUES = new Set(['idle', 'running', 'paused', 'complete']);
const EXTERNAL_HOSTS = new Set([
  'www.figma.com',
  'figma.com',
  'github.com',
  'codex-workflow-gracy.blush-tetra-1726.chatgpt.site'
]);

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ');

function sanitizeStatus(value) {
  if (!value || typeof value !== 'object' || !STATUS_VALUES.has(value.state)) return null;
  if (!Number.isFinite(value.progress) || !Number.isFinite(value.issues)) return null;
  return {
    state: value.state,
    progress: Math.round(Math.min(100, Math.max(0, value.progress))),
    issues: Math.floor(Math.min(99999, Math.max(0, value.issues)))
  };
}

function sanitizePreferences(value, current = { pinned: false, launchAtLogin: false }) {
  const preferences = { pinned: Boolean(current.pinned), launchAtLogin: Boolean(current.launchAtLogin) };
  if (!value || typeof value !== 'object') return preferences;
  if (typeof value.pinned === 'boolean') preferences.pinned = value.pinned;
  if (typeof value.launchAtLogin === 'boolean') preferences.launchAtLogin = value.launchAtLogin;
  return preferences;
}

function isTrustedDocument(url, indexPath) {
  try {
    const parsed = new URL(url);
    const expected = new URL(pathToFileURL(indexPath).href);
    return parsed.protocol === 'file:' && parsed.pathname === expected.pathname && parsed.host === expected.host;
  } catch {
    return false;
  }
}

function isAllowedExternalURL(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      !parsed.port && EXTERNAL_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function trayStatus(status) {
  if (status.state === 'running') return `${status.progress}%`;
  if (status.state === 'paused') return `暂停 ${status.progress}%`;
  if (status.state === 'complete') return status.issues ? `${status.issues} 项` : '已完成';
  return '审核台';
}

function panelBounds(trayBounds, workArea, desired = { width: 365, height: 789 }) {
  const margin = 8;
  const width = Math.min(desired.width, Math.max(1, workArea.width - margin * 2));
  const height = Math.min(desired.height, Math.max(1, workArea.height - margin * 2));
  const clamp = (value, low, high) => Math.max(low, Math.min(value, high));
  const centerX = trayBounds.width > 0
    ? trayBounds.x + trayBounds.width / 2
    : workArea.x + workArea.width - width / 2 - margin;
  const belowTray = trayBounds.height > 0 ? trayBounds.y + trayBounds.height + 5 : workArea.y + margin;
  return {
    x: Math.round(clamp(centerX - width / 2, workArea.x + margin, workArea.x + workArea.width - width - margin)),
    y: Math.round(clamp(belowTray, workArea.y + margin, workArea.y + workArea.height - height - margin)),
    width,
    height
  };
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  sanitizeStatus,
  sanitizePreferences,
  isTrustedDocument,
  isAllowedExternalURL,
  trayStatus,
  panelBounds
};
