import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { AppState, FavoritesData, StrokeLayer } from "./types";
import { loadFavorites, saveFavorites, loadAppState, saveAppState } from "./storage";
import FontList from "./components/FontList";
import PreviewArea from "./components/PreviewArea";
import ControlPanel from "./components/ControlPanel";

function App() {
  const [fonts, setFonts] = useState<string[]>([]);
  const [selectedFont, setSelectedFont] = useState<string | null>(null);
  const [textInput, setTextInput] = useState("サンプルテキスト");
  const [fontSize, setFontSize] = useState(48);
  const [textColor, setTextColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#FFFFFF");
  const [useBgImage, setUseBgImage] = useState(false);
  const [bgImagePath, setBgImagePath] = useState<string | null>(null);
  const [strokeLayers, setStrokeLayers] = useState<StrokeLayer[]>([
    { enabled: false, width: 2, color: "#000000" },
    { enabled: false, width: 4, color: "#FFFFFF" },
    { enabled: false, width: 6, color: "#000000" },
  ]);
  const [isVertical, setIsVertical] = useState(false);
  const [favorites, setFavorites] = useState<FavoritesData>({
    categories: { 'デフォルト': [] },
    categoryColors: { 'デフォルト': '#FFFF00' },
    enabledCategories: { 'デフォルト': true },
  });
  const [filterText, setFilterText] = useState("");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // 初期化：フォントリストと保存された設定を読み込み
  useEffect(() => {
    async function initialize() {
      try {
        // フォントリストを取得
        const systemFonts = await invoke<string[]>("get_system_fonts");
        setFonts(systemFonts);

        // お気に入りを読み込み
        const savedFavorites = await loadFavorites();
        setFavorites(savedFavorites);

        // 保存された状態を読み込み
        const savedState = await loadAppState();
        if (savedState.selectedFontName && systemFonts.includes(savedState.selectedFontName)) {
          setSelectedFont(savedState.selectedFontName);
        }
        if (savedState.textInput) setTextInput(savedState.textInput);
        if (savedState.fontSize) setFontSize(savedState.fontSize);
        if (savedState.textColor) setTextColor(savedState.textColor);
        if (savedState.bgColor) setBgColor(savedState.bgColor);
        if (savedState.useBgImage !== undefined) setUseBgImage(savedState.useBgImage);
        if (savedState.bgImagePath) setBgImagePath(savedState.bgImagePath);
        if (savedState.strokeLayers) setStrokeLayers(savedState.strokeLayers);
        if (savedState.isVertical !== undefined) setIsVertical(savedState.isVertical);
      } catch (error) {
        console.error("Failed to initialize:", error);
      }
    }
    initialize();
  }, []);

  // 状態が変更されたら保存
  useEffect(() => {
    const state: AppState = {
      selectedFontName: selectedFont,
      textInput,
      fontSize,
      textColor,
      bgColor,
      useBgImage,
      bgImagePath,
      strokeLayers,
      isVertical,
    };
    saveAppState(state).catch((error) => {
      console.error("Failed to save app state:", error);
    });
  }, [selectedFont, textInput, fontSize, textColor, bgColor, useBgImage, bgImagePath, strokeLayers, isVertical]);

  // お気に入りが変更されたら保存
  useEffect(() => {
    saveFavorites(favorites).catch((error) => {
      console.error("Failed to save favorites:", error);
    });
  }, [favorites]);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* 左サイドパネル - フォントリスト */}
      <FontList
        fonts={fonts}
        selectedFont={selectedFont}
        onSelectFont={setSelectedFont}
        favorites={favorites}
        onUpdateFavorites={setFavorites}
        filterText={filterText}
        onFilterTextChange={setFilterText}
        showFavoritesOnly={showFavoritesOnly}
        onShowFavoritesOnlyChange={setShowFavoritesOnly}
      />

      {/* 中央 - プレビューエリア */}
      <PreviewArea
        selectedFont={selectedFont}
        textInput={textInput}
        fontSize={fontSize}
        textColor={textColor}
        bgColor={bgColor}
        useBgImage={useBgImage}
        bgImagePath={bgImagePath}
        strokeLayers={strokeLayers}
        isVertical={isVertical}
      />

      {/* 右サイドパネル - コントロールパネル */}
      <ControlPanel
        textInput={textInput}
        onTextInputChange={setTextInput}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        textColor={textColor}
        onTextColorChange={setTextColor}
        bgColor={bgColor}
        onBgColorChange={setBgColor}
        useBgImage={useBgImage}
        onUseBgImageChange={setUseBgImage}
        bgImagePath={bgImagePath}
        onBgImagePathChange={setBgImagePath}
        strokeLayers={strokeLayers}
        onStrokeLayersChange={setStrokeLayers}
        isVertical={isVertical}
        onIsVerticalChange={setIsVertical}
      />
    </div>
  );
}

export default App;
