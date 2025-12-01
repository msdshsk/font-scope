export interface StrokeLayer {
  enabled: boolean;
  width: number;
  color: string;
}

export interface FavoritesData {
  categories: Record<string, string[]>;
  categoryColors: Record<string, string>;
  enabledCategories: Record<string, boolean>;
}

export interface AppState {
  selectedFontName: string | null;
  textInput: string;
  fontSize: number;
  textColor: string;
  bgColor: string;
  useBgImage: boolean;
  bgImagePath: string | null;
  strokeLayers: StrokeLayer[];
  isVertical: boolean;
}
