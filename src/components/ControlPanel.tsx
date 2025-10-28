import { StrokeLayer } from "../types";
import { open } from "@tauri-apps/plugin-dialog";

console.log("ControlPanel loaded, open:", open);

interface ControlPanelProps {
  textInput: string;
  onTextInputChange: (text: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  textColor: string;
  onTextColorChange: (color: string) => void;
  bgColor: string;
  onBgColorChange: (color: string) => void;
  useBgImage: boolean;
  onUseBgImageChange: (use: boolean) => void;
  bgImagePath: string | null;
  onBgImagePathChange: (path: string | null) => void;
  strokeLayers: StrokeLayer[];
  onStrokeLayersChange: (layers: StrokeLayer[]) => void;
}

export default function ControlPanel({
  textInput,
  onTextInputChange,
  fontSize,
  onFontSizeChange,
  textColor,
  onTextColorChange,
  bgColor,
  onBgColorChange,
  useBgImage,
  onUseBgImageChange,
  bgImagePath,
  onBgImagePathChange,
  strokeLayers,
  onStrokeLayersChange,
}: ControlPanelProps) {
  const updateStrokeLayer = (index: number, updates: Partial<StrokeLayer>) => {
    const newLayers = [...strokeLayers];
    newLayers[index] = { ...newLayers[index], ...updates };
    onStrokeLayersChange(newLayers);
  };

  const selectBackgroundImage = async () => {
    console.log("selectBackgroundImage called");
    try {
      console.log("Calling open dialog...");
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "画像",
            extensions: ["png", "jpg", "jpeg", "bmp", "gif"],
          },
        ],
      });

      console.log("Dialog result:", selected);

      if (selected && typeof selected === "string") {
        console.log("Setting image path:", selected);
        onBgImagePathChange(selected);
        onUseBgImageChange(true);
      } else {
        console.log("No file selected or invalid result");
      }
    } catch (error) {
      console.error("Failed to select image:", error);
    }
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto">
      <div className="p-4">
        <h2 className="text-xl font-bold mb-4">コントロールパネル</h2>

        {/* テキスト入力 */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">表示テキスト</label>
          <input
            type="text"
            value={textInput}
            onChange={(e) => onTextInputChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="テキストを入力"
          />
        </div>

        {/* フォントサイズ */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">
            フォントサイズ: {fontSize}px
          </label>
          <input
            type="range"
            min="12"
            max="200"
            value={fontSize}
            onChange={(e) => onFontSizeChange(Number(e.target.value))}
            className="w-full"
          />
        </div>

        {/* テキストカラー */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">テキストカラー</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={textColor}
              onChange={(e) => onTextColorChange(e.target.value)}
              className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={textColor}
              onChange={(e) => onTextColorChange(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        {/* 背景カラー */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">背景カラー</label>
          <div className="flex gap-2">
            <input
              type="color"
              value={bgColor}
              onChange={(e) => onBgColorChange(e.target.value)}
              className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
            />
            <input
              type="text"
              value={bgColor}
              onChange={(e) => onBgColorChange(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>

        {/* 背景画像 */}
        <div className="mb-4">
          <label className="flex items-center mb-2">
            <input
              type="checkbox"
              checked={useBgImage}
              onChange={(e) => onUseBgImageChange(e.target.checked)}
              className="mr-2"
            />
            <span className="text-sm font-medium">背景画像を使用</span>
          </label>
          {useBgImage && (
            <div>
              <button
                onClick={selectBackgroundImage}
                className="w-full px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 mb-2"
              >
                画像を選択
              </button>
              {bgImagePath && (
                <p className="text-xs text-gray-600 break-all">{bgImagePath}</p>
              )}
            </div>
          )}
        </div>

        {/* ストロークレイヤー */}
        <div className="mb-4">
          <h3 className="text-sm font-medium mb-2">ストロークレイヤー</h3>
          {strokeLayers.map((layer, index) => (
            <div key={index} className="mb-3 p-3 bg-gray-50 rounded-md">
              <label className="flex items-center mb-2">
                <input
                  type="checkbox"
                  checked={layer.enabled}
                  onChange={(e) => updateStrokeLayer(index, { enabled: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-sm font-medium">レイヤー {index + 1}</span>
              </label>

              {layer.enabled && (
                <>
                  <div className="mb-2">
                    <label className="block text-xs mb-1">
                      幅: {layer.width}px
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={layer.width}
                      onChange={(e) =>
                        updateStrokeLayer(index, { width: Number(e.target.value) })
                      }
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-xs mb-1">カラー</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={layer.color}
                        onChange={(e) => updateStrokeLayer(index, { color: e.target.value })}
                        className="w-10 h-8 border border-gray-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={layer.color}
                        onChange={(e) => updateStrokeLayer(index, { color: e.target.value })}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
