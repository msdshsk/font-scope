import { useRef, useEffect, useState } from "react";
import { StrokeLayer } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import jsxContent from "../assets/load-svg-as-shape.jsx?raw";

interface PreviewAreaProps {
  selectedFont: string | null;
  textInput: string;
  fontSize: number;
  textColor: string;
  bgColor: string;
  useBgImage: boolean;
  bgImagePath: string | null;
  strokeLayers: StrokeLayer[];
  isVertical: boolean;
}

export default function PreviewArea({
  selectedFont,
  textInput,
  fontSize,
  textColor,
  bgColor,
  useBgImage,
  bgImagePath,
  strokeLayers,
  isVertical,
}: PreviewAreaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMode, setExportMode] = useState<"path_only" | "fill" | "fill_and_stroke">("fill");
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // 横書きプレビュー用のCanvas描画
  useEffect(() => {
    if (isVertical) return; // 縦書きの場合はCanvasを使わない

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        drawPreview();
      }
    };

    const drawPreview = async () => {
      // 背景を描画
      if (useBgImage && bgImagePath) {
        try {
          const assetUrl = convertFileSrc(bgImagePath);

          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = assetUrl;

          await new Promise((resolve, reject) => {
            img.onload = () => {
              resolve(null);
            };
            img.onerror = (e) => {
              console.error("Image load error:", e);
              reject(e);
            };
          });
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        } catch (error) {
          console.error("Failed to load background image:", error);
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      } else {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (!textInput || !selectedFont) return;

      const fontFamily = selectedFont;
      ctx.font = `${fontSize}px "${fontFamily}"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const lines = textInput.split('\n');
      const lineHeight = fontSize * 1.2;
      const totalHeight = lines.length * lineHeight;
      const startY = (canvas.height - totalHeight) / 2 + lineHeight / 2;

      const x = canvas.width / 2;

      lines.forEach((line, lineIndex) => {
        const y = startY + lineIndex * lineHeight;

        for (let i = strokeLayers.length - 1; i >= 0; i--) {
          const layer = strokeLayers[i];
          if (!layer.enabled) continue;

          const samples = Math.max(16, Math.min(64, layer.width * 4));
          for (let j = 0; j < samples; j++) {
            const angle = (j / samples) * 2 * Math.PI;
            const dx = Math.cos(angle) * layer.width;
            const dy = Math.sin(angle) * layer.width;

            ctx.fillStyle = layer.color;
            ctx.fillText(line, x + dx, y + dy);
          }
        }

        ctx.fillStyle = textColor;
        ctx.fillText(line, x, y);
      });
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [selectedFont, textInput, fontSize, textColor, bgColor, useBgImage, bgImagePath, strokeLayers, isVertical]);

  const exportToSvg = async () => {
    if (!selectedFont || !textInput) {
      setExportError("フォントとテキストを選択してください");
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      const svgContent = await invoke<string>("generate_svg", {
        request: {
          font_name: selectedFont,
          text: textInput,
          font_size: fontSize,
          text_color: textColor,
          stroke_layers: strokeLayers,
          export_mode: exportMode,
          vertical: isVertical,
        }
      });

      const savePath = await save({
        defaultPath: "text-export.svg",
        filters: [{
          name: "SVG",
          extensions: ["svg"]
        }]
      });

      if (savePath) {
        await writeTextFile(savePath, svgContent);
        setShowExportPanel(false);
      }

    } catch (error) {
      console.error("SVG export failed:", error);
      setExportError(`エクスポート失敗: ${error}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Photoshop用JSXスクリプトを保存
  const saveJsxScript = async () => {
    try {
      const savePath = await save({
        defaultPath: "load-svg-as-shape.jsx",
        filters: [{
          name: "ExtendScript",
          extensions: ["jsx"]
        }]
      });

      if (savePath) {
        await writeTextFile(savePath, jsxContent);
      }
    } catch (error) {
      console.error("JSX save failed:", error);
    }
  };

  // ストロークのtext-shadow CSS生成
  const generateTextShadow = () => {
    const shadows: string[] = [];

    // 逆順（外側から）
    for (let i = strokeLayers.length - 1; i >= 0; i--) {
      const layer = strokeLayers[i];
      if (!layer.enabled) continue;

      const samples = Math.max(8, Math.min(32, layer.width * 2));
      for (let j = 0; j < samples; j++) {
        const angle = (j / samples) * 2 * Math.PI;
        const dx = Math.cos(angle) * layer.width;
        const dy = Math.sin(angle) * layer.width;
        shadows.push(`${dx.toFixed(1)}px ${dy.toFixed(1)}px 0 ${layer.color}`);
      }
    }

    return shadows.length > 0 ? shadows.join(", ") : "none";
  };

  // 背景スタイル
  const bgStyle = useBgImage && bgImagePath
    ? { backgroundImage: `url(${convertFileSrc(bgImagePath)})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundColor: bgColor };

  return (
    <div className="flex-1 bg-gray-200 flex flex-col relative">
      {/* エクスポートパネル */}
      <div className="absolute top-2 right-2 z-10 flex gap-2">
        <button
          onClick={saveJsxScript}
          className="px-3 py-1.5 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 shadow"
          title="Photoshop用SVG読み込みスクリプトを保存"
        >
          PS用JSX
        </button>
        <button
          onClick={() => setShowExportPanel(!showExportPanel)}
          className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 shadow"
        >
          SVG出力
        </button>

        {showExportPanel && (
          <div className="absolute top-10 right-0 bg-white rounded-lg shadow-lg p-4 min-w-[240px]">
            <h3 className="font-bold text-sm mb-3">SVGエクスポート設定</h3>

            <div className="mb-3">
              <label className="block text-xs text-gray-600 mb-1">出力モード</label>
              <div className="space-y-1">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="exportMode"
                    value="path_only"
                    checked={exportMode === "path_only"}
                    onChange={() => setExportMode("path_only")}
                    className="mr-2"
                  />
                  <span className="text-sm">パスのみ（塗り/線なし）</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="exportMode"
                    value="fill"
                    checked={exportMode === "fill"}
                    onChange={() => setExportMode("fill")}
                    className="mr-2"
                  />
                  <span className="text-sm">塗りあり</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input
                    type="radio"
                    name="exportMode"
                    value="fill_and_stroke"
                    checked={exportMode === "fill_and_stroke"}
                    onChange={() => setExportMode("fill_and_stroke")}
                    className="mr-2"
                  />
                  <span className="text-sm">塗り + ストローク</span>
                </label>
              </div>
            </div>

            <button
              onClick={exportToSvg}
              disabled={isExporting || !selectedFont || !textInput}
              className={`w-full px-3 py-2 rounded text-white text-sm ${
                isExporting || !selectedFont || !textInput
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-green-500 hover:bg-green-600"
              }`}
            >
              {isExporting ? "エクスポート中..." : "SVGとして保存"}
            </button>

            {(!selectedFont || !textInput) && (
              <p className="text-xs text-gray-500 mt-2">
                フォントとテキストを選択してください
              </p>
            )}

            {exportError && (
              <p className="text-xs text-red-500 mt-2">
                {exportError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* プレビューエリア */}
      <div className="flex-1 flex items-center justify-center p-4">
        {isVertical ? (
          // 縦書きプレビュー（CSS writing-mode使用）
          <div
            className="w-full h-full flex items-center justify-center overflow-hidden"
            style={bgStyle}
          >
            <div
              style={{
                writingMode: "vertical-rl",
                fontFamily: selectedFont ? `"${selectedFont}"` : "inherit",
                fontSize: `${fontSize}px`,
                color: textColor,
                textShadow: generateTextShadow(),
                whiteSpace: "pre-wrap",
                lineHeight: 1.2,
              }}
            >
              {textInput || "テキストを入力"}
            </div>
          </div>
        ) : (
          // 横書きプレビュー（Canvas使用）
          <canvas ref={canvasRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
