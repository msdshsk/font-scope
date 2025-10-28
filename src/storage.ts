import { AppState, FavoritesData } from './types';

const FAVORITES_KEY = 'font-checker-favorites';
const APP_STATE_KEY = 'font-checker-app-state';

export const loadFavorites = (): FavoritesData => {
  const stored = localStorage.getItem(FAVORITES_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return {
    categories: { 'デフォルト': [] },
    categoryColors: { 'デフォルト': '#FFFF00' },
    enabledCategories: { 'デフォルト': true },
  };
};

export const saveFavorites = (favorites: FavoritesData): void => {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
};

export const loadAppState = (): Partial<AppState> => {
  const stored = localStorage.getItem(APP_STATE_KEY);
  if (stored) {
    return JSON.parse(stored);
  }
  return {};
};

export const saveAppState = (state: AppState): void => {
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
};
