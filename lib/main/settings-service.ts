import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

interface Settings {
  lastRepoPath?: string;
}

const settingsPath = path.join(app.getPath('userData'), 'ledger-settings.json');

function loadSettings(): Settings {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return {};
}

function saveSettings(settings: Settings): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

export function getLastRepoPath(): string | null {
  const settings = loadSettings();
  // Verify the path still exists
  if (settings.lastRepoPath && fs.existsSync(settings.lastRepoPath)) {
    return settings.lastRepoPath;
  }
  return null;
}

export function saveLastRepoPath(repoPath: string): void {
  const settings = loadSettings();
  settings.lastRepoPath = repoPath;
  saveSettings(settings);
}

export function clearLastRepoPath(): void {
  const settings = loadSettings();
  delete settings.lastRepoPath;
  saveSettings(settings);
}

