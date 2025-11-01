import { AppState, FavoritesData } from './types';
import { invoke } from '@tauri-apps/api/core';
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

const SETTINGS_FILENAME = 'font-scope-settings.json';
const FAVORITES_KEY = 'font-checker-favorites';
const APP_STATE_KEY = 'font-checker-app-state';

interface SettingsData {
  favorites: FavoritesData;
  appState: Partial<AppState>;
}

let settingsFilePath: string | null = null;

// 設定ファイルのパスを取得（初回のみ実行）
async function getSettingsFilePath(): Promise<string> {
  if (settingsFilePath) {
    return settingsFilePath;
  }

  try {
    const exeDir = await invoke<string>('get_exe_dir');
    console.log('[Storage] Exe directory:', exeDir);

    // パスの区切り文字を正規化（バックスラッシュの場合もスラッシュの場合も対応）
    const normalizedDir = exeDir.replace(/\\/g, '/');
    settingsFilePath = `${normalizedDir}/${SETTINGS_FILENAME}`;

    console.log('[Storage] Settings file path:', settingsFilePath);
    return settingsFilePath;
  } catch (error) {
    console.error('[Storage] Failed to get exe directory:', error);
    throw error;
  }
}

// LocalStorageからデータを読み込んで移行
function migrateFromLocalStorage(): SettingsData {
  const defaultSettings: SettingsData = {
    favorites: {
      categories: { 'デフォルト': [] },
      categoryColors: { 'デフォルト': '#FFFF00' },
      enabledCategories: { 'デフォルト': true },
    },
    appState: {},
  };

  try {
    // LocalStorageからお気に入りを取得
    const storedFavorites = localStorage.getItem(FAVORITES_KEY);
    if (storedFavorites) {
      defaultSettings.favorites = JSON.parse(storedFavorites);
      console.log('Migrated favorites from localStorage');
    }

    // LocalStorageからアプリ状態を取得
    const storedAppState = localStorage.getItem(APP_STATE_KEY);
    if (storedAppState) {
      defaultSettings.appState = JSON.parse(storedAppState);
      console.log('Migrated app state from localStorage');
    }

    // 移行が成功したらLocalStorageから削除（オプション）
    // localStorage.removeItem(FAVORITES_KEY);
    // localStorage.removeItem(APP_STATE_KEY);
  } catch (error) {
    console.error('Failed to migrate from localStorage:', error);
  }

  return defaultSettings;
}

// 設定ファイルを読み込み
async function loadSettings(): Promise<SettingsData> {
  try {
    const filePath = await getSettingsFilePath();
    console.log('[Storage] Checking if file exists:', filePath);

    // JSONファイルが存在する場合は読み込み
    const fileExists = await exists(filePath);
    console.log('[Storage] File exists:', fileExists);

    if (fileExists) {
      console.log('[Storage] Reading settings from file...');
      const content = await readTextFile(filePath);
      console.log('[Storage] File content loaded successfully');
      return JSON.parse(content);
    } else {
      // JSONファイルが存在しない場合はLocalStorageから移行
      console.log('[Storage] Settings file not found, migrating from localStorage...');
      const migratedSettings = migrateFromLocalStorage();

      // 移行したデータをJSONファイルに保存
      console.log('[Storage] Saving migrated settings to file...');
      await saveSettings(migratedSettings);
      console.log('[Storage] Migration completed successfully');

      return migratedSettings;
    }
  } catch (error) {
    console.error('[Storage] Failed to load settings:', error);
    // エラーの場合もLocalStorageからの移行を試みる
    return migrateFromLocalStorage();
  }
}

// 設定ファイルを保存
async function saveSettings(settings: SettingsData): Promise<void> {
  try {
    const filePath = await getSettingsFilePath();
    const content = JSON.stringify(settings, null, 2);
    console.log('[Storage] Writing to file:', filePath);
    console.log('[Storage] Content length:', content.length);
    await writeTextFile(filePath, content);
    console.log('[Storage] File written successfully');
  } catch (error) {
    console.error('[Storage] Failed to save settings:', error);
    throw error;
  }
}

export const loadFavorites = async (): Promise<FavoritesData> => {
  const settings = await loadSettings();
  return settings.favorites;
};

export const saveFavorites = async (favorites: FavoritesData): Promise<void> => {
  const settings = await loadSettings();
  settings.favorites = favorites;
  await saveSettings(settings);
};

export const loadAppState = async (): Promise<Partial<AppState>> => {
  const settings = await loadSettings();
  return settings.appState;
};

export const saveAppState = async (state: AppState): Promise<void> => {
  const settings = await loadSettings();
  settings.appState = state;
  await saveSettings(settings);
};
