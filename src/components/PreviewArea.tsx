import { useRef, useEffect } from "react";
import { StrokeLayer } from "../types";
import { convertFileSrc } from "@tauri-apps/api/core";

console.log("convertFileSrc:", convertFileSrc);

interface PreviewAreaProps {
  selectedFont: string | null;
  textInput: string;
  fontSize: number;
  textColor: string;
  bgColor: string;
  useBgImage: boolean;
  bgImagePath: string | null;
  strokeLayers: StrokeLayer[];
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
}: PreviewAreaProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // キャンバスのサイズを親要素に合わせる
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
          console.log("Original path:", bgImagePath);
          const assetUrl = convertFileSrc(bgImagePath);
          console.log("Converted URL:", assetUrl);

          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = assetUrl;

          await new Promise((resolve, reject) => {
            img.onload = () => {
              console.log("Image loaded successfully");
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

      // テキストの基本設定
      const fontFamily = selectedFont;
      ctx.font = `${fontSize}px "${fontFamily}"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const x = canvas.width / 2;
      const y = canvas.height / 2;

      // ストロークレイヤーを逆順で描画（外側から）
      for (let i = strokeLayers.length - 1; i >= 0; i--) {
        const layer = strokeLayers[i];
        if (!layer.enabled) continue;

        // 円形サンプリングでストロークを描画
        const samples = Math.max(16, Math.min(64, layer.width * 4));
        for (let j = 0; j < samples; j++) {
          const angle = (j / samples) * 2 * Math.PI;
          const dx = Math.cos(angle) * layer.width;
          const dy = Math.sin(angle) * layer.width;

          ctx.fillStyle = layer.color;
          ctx.fillText(textInput, x + dx, y + dy);
        }
      }

      // メインテキストを描画
      ctx.fillStyle = textColor;
      ctx.fillText(textInput, x, y);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [selectedFont, textInput, fontSize, textColor, bgColor, useBgImage, bgImagePath, strokeLayers]);

  return (
    <div className="flex-1 bg-gray-200 flex items-center justify-center p-4">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
