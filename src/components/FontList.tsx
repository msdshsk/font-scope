import { useState } from "react";
import { FavoritesData } from "../types";

interface FontListProps {
  fonts: string[];
  selectedFont: string | null;
  onSelectFont: (font: string) => void;
  favorites: FavoritesData;
  onUpdateFavorites: (favorites: FavoritesData) => void;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  showFavoritesOnly: boolean;
  onShowFavoritesOnlyChange: (show: boolean) => void;
}

export default function FontList({
  fonts,
  selectedFont,
  onSelectFont,
  favorites,
  onUpdateFavorites,
  filterText,
  onFilterTextChange,
  showFavoritesOnly,
  onShowFavoritesOnlyChange,
}: FontListProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("デフォルト");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCategoryManagement, setShowCategoryManagement] = useState(false);
  const [filterByCategory, setFilterByCategory] = useState<string | null>(null);

  const isFavorite = (fontName: string): boolean => {
    return Object.values(favorites.categories).some((fonts) => fonts.includes(fontName));
  };

  const getCategoryForFont = (fontName: string): string | null => {
    for (const [category, fonts] of Object.entries(favorites.categories)) {
      if (fonts.includes(fontName)) {
        return category;
      }
    }
    return null;
  };

  const toggleFavorite = (fontName: string) => {
    const category = getCategoryForFont(fontName);
    if (category) {
      // 削除
      const newFavorites = { ...favorites };
      newFavorites.categories[category] = newFavorites.categories[category].filter(
        (f) => f !== fontName
      );
      onUpdateFavorites(newFavorites);
    } else {
      // 追加
      const newFavorites = { ...favorites };
      if (!newFavorites.categories[selectedCategory]) {
        newFavorites.categories[selectedCategory] = [];
      }
      newFavorites.categories[selectedCategory].push(fontName);
      onUpdateFavorites(newFavorites);
    }
  };

  const createCategory = () => {
    if (newCategoryName && !favorites.categories[newCategoryName]) {
      const newFavorites = { ...favorites };
      newFavorites.categories[newCategoryName] = [];
      newFavorites.categoryColors[newCategoryName] = "#FFFF00";
      newFavorites.enabledCategories[newCategoryName] = true;
      onUpdateFavorites(newFavorites);
      setNewCategoryName("");
    }
  };

  const setCategoryColor = (category: string, color: string) => {
    const newFavorites = { ...favorites };
    newFavorites.categoryColors[category] = color;
    onUpdateFavorites(newFavorites);
  };

  const toggleCategoryEnabled = (category: string) => {
    const newFavorites = { ...favorites };
    newFavorites.enabledCategories[category] = !newFavorites.enabledCategories[category];
    onUpdateFavorites(newFavorites);
  };

  const isInEnabledCategory = (fontName: string): boolean => {
    const category = getCategoryForFont(fontName);
    if (!category) return true; // 未分類は常に表示
    return favorites.enabledCategories[category] !== false;
  };

  const filteredFonts = fonts.filter((font) => {
    const matchesSearch = filterText === "" || font.toLowerCase().includes(filterText.toLowerCase());
    const matchesFavorites = !showFavoritesOnly || isFavorite(font);
    const matchesCategory = isInEnabledCategory(font);

    // カテゴリ選択フィルタ
    const matchesCategoryFilter = !filterByCategory || (
      favorites.categories[filterByCategory]?.includes(font)
    );

    return matchesSearch && matchesFavorites && matchesCategory && matchesCategoryFilter;
  });

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h2 className="text-xl font-bold mb-4">フォント一覧</h2>

        {/* 検索フィルター */}
        <input
          type="text"
          placeholder="検索..."
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* お気に入りフィルター */}
        <label className="flex items-center mb-2">
          <input
            type="checkbox"
            checked={showFavoritesOnly}
            onChange={(e) => onShowFavoritesOnlyChange(e.target.checked)}
            className="mr-2"
          />
          <span>お気に入りのみ表示</span>
        </label>

        {/* カテゴリ管理 */}
        <button
          onClick={() => setShowCategoryManagement(!showCategoryManagement)}
          className="w-full px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm"
        >
          {showCategoryManagement ? "▼ カテゴリ管理" : "▶ カテゴリ管理"}
        </button>

        {showCategoryManagement && (
          <div className="mt-2 p-2 bg-gray-50 rounded-md">
            {/* 新規カテゴリ作成 */}
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                placeholder="新規カテゴリ"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
              />
              <button
                onClick={createCategory}
                className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
              >
                作成
              </button>
            </div>

            {/* カテゴリ一覧 */}
            <div className="space-y-1">
              {Object.keys(favorites.categories)
                .sort()
                .map((category) => (
                  <div key={category} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={favorites.enabledCategories[category] !== false}
                      onChange={() => toggleCategoryEnabled(category)}
                      className="flex-shrink-0"
                    />
                    <input
                      type="color"
                      value={favorites.categoryColors[category] || "#FFFF00"}
                      onChange={(e) => setCategoryColor(category, e.target.value)}
                      className="w-8 h-6 border-none rounded cursor-pointer"
                    />
                    <button
                      onClick={() => setSelectedCategory(category)}
                      className={`flex-1 text-left px-2 py-1 rounded text-sm ${
                        selectedCategory === category ? "bg-blue-100" : "hover:bg-gray-100"
                      }`}
                    >
                      {category} ({favorites.categories[category].length})
                    </button>
                    <button
                      onClick={() => setFilterByCategory(filterByCategory === category ? null : category)}
                      className={`px-2 py-1 text-xs rounded ${
                        filterByCategory === category
                          ? "bg-blue-500 text-white"
                          : "bg-gray-200 hover:bg-gray-300"
                      }`}
                    >
                      {filterByCategory === category ? "解除" : "選択"}
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* フォントリスト */}
      <div className="flex-1 overflow-y-auto">
        {filteredFonts.map((font) => {
          const isFav = isFavorite(font);
          const category = getCategoryForFont(font);
          const color = category ? favorites.categoryColors[category] : undefined;

          return (
            <div
              key={font}
              className={`flex items-center px-4 py-2 border-b border-gray-100 hover:bg-gray-50 ${
                selectedFont === font ? "bg-blue-50" : ""
              }`}
            >
              <button
                onClick={() => toggleFavorite(font)}
                className="mr-2 text-xl"
                style={{ color: isFav && color ? color : undefined }}
              >
                {isFav ? "★" : "☆"}
              </button>
              <button
                onClick={() => onSelectFont(font)}
                className="flex-1 text-left"
                style={{ color: isFav && color ? color : undefined }}
              >
                {font}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
