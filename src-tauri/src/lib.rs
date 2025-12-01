use font_kit::family_name::FamilyName;
use font_kit::properties::Properties;
use font_kit::source::SystemSource;
use rustybuzz::{Face as BuzzFace, UnicodeBuffer, Direction};
use std::env;
use std::fs;
use std::sync::Arc;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_exe_dir() -> Result<String, String> {
    match env::current_exe() {
        Ok(exe_path) => {
            if let Some(exe_dir) = exe_path.parent() {
                Ok(exe_dir.to_string_lossy().to_string())
            } else {
                Err("Failed to get parent directory".to_string())
            }
        }
        Err(e) => Err(format!("Failed to get exe path: {}", e)),
    }
}

#[tauri::command]
fn get_system_fonts() -> Vec<String> {
    let source = SystemSource::new();
    let mut fonts = Vec::new();

    if let Ok(families) = source.all_families() {
        fonts = families;
        fonts.sort();
    }

    fonts
}

#[tauri::command]
fn get_font_family_name(font_name: &str) -> Option<String> {
    let source = SystemSource::new();

    match source.select_best_match(
        &[FamilyName::Title(font_name.to_string())],
        &Properties::new(),
    ) {
        Ok(_) => Some(font_name.to_string()),
        Err(_) => None,
    }
}

#[tauri::command]
fn get_font_file_path(font_name: &str) -> Result<String, String> {
    let source = SystemSource::new();

    match source.select_best_match(
        &[FamilyName::Title(font_name.to_string())],
        &Properties::new(),
    ) {
        Ok(handle) => {
            match handle {
                font_kit::handle::Handle::Path { path, font_index: _ } => {
                    Ok(path.to_string_lossy().to_string())
                }
                font_kit::handle::Handle::Memory { .. } => {
                    Err("Font is loaded from memory, not a file".to_string())
                }
            }
        }
        Err(e) => Err(format!("Failed to find font: {:?}", e)),
    }
}

#[derive(serde::Deserialize)]
struct StrokeLayer {
    enabled: bool,
    width: f64,
    color: String,
}

#[derive(serde::Deserialize)]
struct SvgExportRequest {
    font_name: String,
    text: String,
    font_size: f64,
    text_color: String,
    stroke_layers: Vec<StrokeLayer>,
    /// "path_only" | "fill" | "fill_and_stroke"
    export_mode: String,
    /// true = 縦書き, false = 横書き
    vertical: bool,
}

struct PathBuilder {
    path_data: String,
    scale: f64,
    offset_x: f64,
    offset_y: f64,
}

impl PathBuilder {
    fn new(scale: f64, offset_x: f64, offset_y: f64) -> Self {
        Self {
            path_data: String::new(),
            scale,
            offset_x,
            offset_y,
        }
    }

    fn transform_x(&self, x: f32) -> f64 {
        (x as f64) * self.scale + self.offset_x
    }

    fn transform_y(&self, y: f32) -> f64 {
        // Y軸を反転（フォントは上がプラス、SVGは下がプラス）
        self.offset_y - (y as f64) * self.scale
    }
}

impl ttf_parser::OutlineBuilder for PathBuilder {
    fn move_to(&mut self, x: f32, y: f32) {
        let tx = self.transform_x(x);
        let ty = self.transform_y(y);
        self.path_data.push_str(&format!("M{:.2} {:.2}", tx, ty));
    }

    fn line_to(&mut self, x: f32, y: f32) {
        let tx = self.transform_x(x);
        let ty = self.transform_y(y);
        self.path_data.push_str(&format!("L{:.2} {:.2}", tx, ty));
    }

    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        let tx1 = self.transform_x(x1);
        let ty1 = self.transform_y(y1);
        let tx = self.transform_x(x);
        let ty = self.transform_y(y);
        self.path_data.push_str(&format!("Q{:.2} {:.2} {:.2} {:.2}", tx1, ty1, tx, ty));
    }

    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        let tx1 = self.transform_x(x1);
        let ty1 = self.transform_y(y1);
        let tx2 = self.transform_x(x2);
        let ty2 = self.transform_y(y2);
        let tx = self.transform_x(x);
        let ty = self.transform_y(y);
        self.path_data.push_str(&format!("C{:.2} {:.2} {:.2} {:.2} {:.2} {:.2}", tx1, ty1, tx2, ty2, tx, ty));
    }

    fn close(&mut self) {
        self.path_data.push('Z');
    }
}

fn escape_xml_char(ch: char) -> String {
    match ch {
        '"' => "&quot;".to_string(),
        '&' => "&amp;".to_string(),
        '<' => "&lt;".to_string(),
        '>' => "&gt;".to_string(),
        _ => ch.to_string(),
    }
}

/// 横書き用SVG生成
fn generate_horizontal_svg(
    face: &ttf_parser::Face,
    request: &SvgExportRequest,
    scale: f64,
    is_path_only: bool,
    include_stroke: bool,
    enabled_stroke_layers: &[&StrokeLayer],
) -> String {
    let lines: Vec<&str> = request.text.lines().collect();
    let line_height = request.font_size * 1.2;

    // 各行の幅を計算
    let mut max_width: f64 = 0.0;
    let mut line_widths: Vec<f64> = Vec::new();

    for line in &lines {
        let mut width: f64 = 0.0;
        for ch in line.chars() {
            if let Some(glyph_id) = face.glyph_index(ch) {
                if let Some(advance) = face.glyph_hor_advance(glyph_id) {
                    width += (advance as f64) * scale;
                }
            }
        }
        line_widths.push(width);
        if width > max_width {
            max_width = width;
        }
    }

    let padding = 20.0;
    let svg_width = max_width + padding * 2.0;
    let total_height = (lines.len() as f64) * line_height;
    let svg_height = total_height + padding * 2.0;

    let mut svg_content = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{:.0}" height="{:.0}" viewBox="0 0 {:.0} {:.0}">
"#,
        svg_width, svg_height, svg_width, svg_height
    );

    let mut char_index: usize = 0;

    for (line_index, line) in lines.iter().enumerate() {
        if line.is_empty() {
            continue;
        }

        let line_width = line_widths[line_index];
        let start_x = (svg_width - line_width) / 2.0;
        let baseline_y = padding + ((line_index + 1) as f64) * line_height;

        let mut cursor_x = start_x;

        for ch in line.chars() {
            if ch.is_whitespace() {
                if let Some(glyph_id) = face.glyph_index(ch) {
                    if let Some(advance) = face.glyph_hor_advance(glyph_id) {
                        cursor_x += (advance as f64) * scale;
                    }
                }
                char_index += 1;
                continue;
            }

            if let Some(glyph_id) = face.glyph_index(ch) {
                let mut builder = PathBuilder::new(scale, cursor_x, baseline_y);
                face.outline_glyph(glyph_id, &mut builder);
                let path_data = &builder.path_data;

                if !path_data.is_empty() {
                    let escaped_char = escape_xml_char(ch);

                    // 各文字を<g>でグループ化（複数パスの文字に対応）
                    svg_content.push_str(&format!(
                        r#"  <g id="char-{}" data-char="{}">"#,
                        char_index, escaped_char
                    ));
                    svg_content.push('\n');

                    if is_path_only {
                        // パスのみ
                        svg_content.push_str(&format!(r#"    <path d="{}"/>"#, path_data));
                        svg_content.push('\n');
                    } else {
                        // 塗り/ストロークあり
                        if include_stroke && !enabled_stroke_layers.is_empty() {
                            for layer in enabled_stroke_layers.iter() {
                                svg_content.push_str(&format!(
                                    r#"    <path d="{}" fill="{}" stroke="{}" stroke-width="{:.1}" stroke-linejoin="round" stroke-linecap="round"/>"#,
                                    path_data, layer.color, layer.color, layer.width * 2.0
                                ));
                                svg_content.push('\n');
                            }
                        }
                        svg_content.push_str(&format!(
                            r#"    <path d="{}" fill="{}"/>"#,
                            path_data, request.text_color
                        ));
                        svg_content.push('\n');
                    }

                    svg_content.push_str("  </g>\n");
                }

                if let Some(advance) = face.glyph_hor_advance(glyph_id) {
                    cursor_x += (advance as f64) * scale;
                }
            }

            char_index += 1;
        }
    }

    svg_content.push_str("</svg>");
    svg_content
}

/// 縦書き用のPathBuilder
/// OpenType仕様に基づき、縦書きでは:
/// - Y座標: glyph_y_origin (top side bearing + bbox top) から下方向へ描画
/// - X座標: グリフの水平方向中心を列の中心に配置
struct VerticalPathBuilder {
    path_data: String,
    scale: f64,
    col_center_x: f64,    // 列の中心X座標
    glyph_top_y: f64,     // グリフの配置位置（SVG座標系での上端）
    glyph_hor_advance: f64, // グリフの水平advance（中央揃え用）
}

impl VerticalPathBuilder {
    fn new(scale: f64, col_center_x: f64, glyph_top_y: f64, glyph_hor_advance: f64) -> Self {
        Self {
            path_data: String::new(),
            scale,
            col_center_x,
            glyph_top_y,
            glyph_hor_advance,
        }
    }

    fn transform_x(&self, x: f32) -> f64 {
        // グリフ座標系のx=0は左端、x=hor_advanceは右端
        // グリフを水平方向中央揃えにするため、x - hor_advance/2 でオフセット
        let glyph_center_offset = self.glyph_hor_advance / 2.0;
        self.col_center_x + ((x as f64) * self.scale - glyph_center_offset)
    }

    fn transform_y(&self, y: f32) -> f64 {
        // フォント座標系: Y上が正、原点はベースライン上
        // SVG座標系: Y下が正
        // glyph_top_yはグリフを配置する位置（SVG座標系での上端付近）
        // フォント座標のyを反転してSVG座標に変換
        self.glyph_top_y - (y as f64) * self.scale
    }
}

impl ttf_parser::OutlineBuilder for VerticalPathBuilder {
    fn move_to(&mut self, x: f32, y: f32) {
        let tx = self.transform_x(x);
        let ty = self.transform_y(y);
        self.path_data.push_str(&format!("M{:.2} {:.2}", tx, ty));
    }

    fn line_to(&mut self, x: f32, y: f32) {
        let tx = self.transform_x(x);
        let ty = self.transform_y(y);
        self.path_data.push_str(&format!("L{:.2} {:.2}", tx, ty));
    }

    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        let tx1 = self.transform_x(x1);
        let ty1 = self.transform_y(y1);
        let tx = self.transform_x(x);
        let ty = self.transform_y(y);
        self.path_data.push_str(&format!("Q{:.2} {:.2} {:.2} {:.2}", tx1, ty1, tx, ty));
    }

    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        let tx1 = self.transform_x(x1);
        let ty1 = self.transform_y(y1);
        let tx2 = self.transform_x(x2);
        let ty2 = self.transform_y(y2);
        let tx = self.transform_x(x);
        let ty = self.transform_y(y);
        self.path_data.push_str(&format!("C{:.2} {:.2} {:.2} {:.2} {:.2} {:.2}", tx1, ty1, tx2, ty2, tx, ty));
    }

    fn close(&mut self) {
        self.path_data.push('Z');
    }
}

/// 縦書き用SVG生成（rustybuzzでvert featureを適用）
fn generate_vertical_svg(
    font_data: &[u8],
    face: &ttf_parser::Face,
    request: &SvgExportRequest,
    scale: f64,
    is_path_only: bool,
    include_stroke: bool,
    enabled_stroke_layers: &[&StrokeLayer],
) -> Result<String, String> {
    // rustybuzz用のフォントフェイスを作成
    let font_data_arc = Arc::new(font_data.to_vec());
    let buzz_face = BuzzFace::from_slice(&font_data_arc, 0)
        .ok_or("Failed to create rustybuzz face")?;

    let lines: Vec<&str> = request.text.lines().collect();
    let line_height = request.font_size * 1.2; // 列間隔

    // グリフ情報を収集
    struct GlyphInfo {
        glyph_id: ttf_parser::GlyphId,
        y_advance: f64,          // 縦方向の送り量（スケール適用済み）
        ch: char,
        glyph_hor_advance: f64,  // 水平方向のadvance（中央揃え用、スケール適用済み）
        glyph_height: f64,       // グリフの高さ（bbox_top - bbox_bottom、スケール適用済み）
        glyph_y_origin: f64,     // 縦書き原点Y（スケール適用済み）
    }

    let mut column_infos: Vec<Vec<GlyphInfo>> = Vec::new();
    let mut max_height: f64 = 0.0;

    for line in &lines {
        // rustybuzzでシェイピング（縦書きモード）
        let mut buffer = UnicodeBuffer::new();
        buffer.push_str(line);
        buffer.set_direction(Direction::TopToBottom);

        let glyph_buffer = rustybuzz::shape(&buzz_face, &[], buffer);
        let glyph_infos = glyph_buffer.glyph_infos();
        let glyph_positions = glyph_buffer.glyph_positions();

        let chars: Vec<char> = line.chars().collect();
        let mut column_glyphs: Vec<GlyphInfo> = Vec::new();
        let mut height: f64 = 0.0;

        for (i, (info, pos)) in glyph_infos.iter().zip(glyph_positions.iter()).enumerate() {
            let glyph_id = ttf_parser::GlyphId(info.glyph_id as u16);
            let ch = if i < chars.len() { chars[i] } else { '?' };

            // 縦書きの送り量を取得
            // rustybuzzのy_advanceは負の値で返ってくる（上から下へ進むため）
            let y_advance = if pos.y_advance != 0 {
                -(pos.y_advance as f64) * scale
            } else {
                // フォールバック: 縦書きadvanceを使用、なければフォントサイズ
                face.glyph_ver_advance(glyph_id)
                    .map(|adv| (adv as f64) * scale)
                    .unwrap_or(request.font_size)
            };

            // 水平方向のadvance（中央揃え用）
            let glyph_hor_advance = face.glyph_hor_advance(glyph_id)
                .map(|adv| (adv as f64) * scale)
                .unwrap_or(request.font_size);

            // グリフの縦書き原点Y座標を取得
            // OpenType仕様: y_origin = top_side_bearing + bbox.y_max
            // ttf-parserのglyph_y_originはVORGテーブルから直接取得（CFFフォント用）
            // TrueTypeフォントではbboxとtop_side_bearingから計算
            let glyph_y_origin = if let Some(y_origin) = face.glyph_y_origin(glyph_id) {
                // VORGテーブルがある場合（CFFフォント）
                (y_origin as f64) * scale
            } else if let Some(bbox) = face.glyph_bounding_box(glyph_id) {
                // TrueTypeフォント: bbox.y_max + top_side_bearing
                let tsb = face.glyph_ver_side_bearing(glyph_id).unwrap_or(0);
                ((bbox.y_max as i32 + tsb as i32) as f64) * scale
            } else {
                // フォールバック: ascenderを使用
                face.ascender() as f64 * scale
            };

            // グリフの高さ（境界ボックスから）
            let glyph_height = if let Some(bbox) = face.glyph_bounding_box(glyph_id) {
                ((bbox.y_max - bbox.y_min) as f64) * scale
            } else {
                request.font_size
            };

            column_glyphs.push(GlyphInfo {
                glyph_id,
                y_advance,
                ch,
                glyph_hor_advance,
                glyph_height,
                glyph_y_origin,
            });

            height += y_advance;
        }

        column_infos.push(column_glyphs);
        if height > max_height {
            max_height = height;
        }
    }

    // パディングを大きめに取る（文字がはみ出さないように）
    let padding = request.font_size * 0.5 + 20.0;
    let svg_width = (lines.len() as f64) * line_height + padding * 2.0;
    let svg_height = max_height + padding * 2.0;

    let mut svg_content = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="{:.0}" height="{:.0}" viewBox="0 0 {:.0} {:.0}">
"#,
        svg_width, svg_height, svg_width, svg_height
    );

    let mut char_index: usize = 0;

    // 縦書きは右から左に列を配置
    for (col_index, column_glyphs) in column_infos.iter().enumerate() {
        if column_glyphs.is_empty() {
            continue;
        }

        // 右から左へ配置（col_index=0が一番右）
        let col_center_x = svg_width - padding - (col_index as f64 + 0.5) * line_height;

        // cursor_yは各グリフの「縦書き原点」のY座標（SVG座標系）
        // 最初の文字の縦書き原点はpaddingの位置から開始
        let mut cursor_y = padding;

        for glyph_info in column_glyphs {
            if glyph_info.ch.is_whitespace() {
                cursor_y += glyph_info.y_advance;
                char_index += 1;
                continue;
            }

            // グリフの配置位置
            // glyph_top_y: SVG座標系でのグリフ描画開始Y位置
            // 縦書き原点(cursor_y)から、フォント座標系の原点位置分だけオフセット
            let glyph_top_y = cursor_y + glyph_info.glyph_y_origin;

            let mut builder = VerticalPathBuilder::new(
                scale,
                col_center_x,
                glyph_top_y,
                glyph_info.glyph_hor_advance,
            );
            face.outline_glyph(glyph_info.glyph_id, &mut builder);
            let path_data = &builder.path_data;

            if !path_data.is_empty() {
                let escaped_char = escape_xml_char(glyph_info.ch);

                // 各文字を<g>でグループ化（複数パスの文字に対応）
                svg_content.push_str(&format!(
                    r#"  <g id="char-{}" data-char="{}">"#,
                    char_index, escaped_char
                ));
                svg_content.push('\n');

                if is_path_only {
                    // パスのみ
                    svg_content.push_str(&format!(r#"    <path d="{}"/>"#, path_data));
                    svg_content.push('\n');
                } else {
                    // 塗り/ストロークあり
                    if include_stroke && !enabled_stroke_layers.is_empty() {
                        for layer in enabled_stroke_layers.iter() {
                            svg_content.push_str(&format!(
                                r#"    <path d="{}" fill="{}" stroke="{}" stroke-width="{:.1}" stroke-linejoin="round" stroke-linecap="round"/>"#,
                                path_data, layer.color, layer.color, layer.width * 2.0
                            ));
                            svg_content.push('\n');
                        }
                    }
                    svg_content.push_str(&format!(
                        r#"    <path d="{}" fill="{}"/>"#,
                        path_data, request.text_color
                    ));
                    svg_content.push('\n');
                }

                svg_content.push_str("  </g>\n");
            }

            // 縦方向に進める
            cursor_y += glyph_info.y_advance;
            char_index += 1;
        }
    }

    svg_content.push_str("</svg>");
    Ok(svg_content)
}

#[tauri::command]
fn generate_svg(request: SvgExportRequest) -> Result<String, String> {
    let source = SystemSource::new();

    // フォントファイルのパスを取得
    let font_path = match source.select_best_match(
        &[FamilyName::Title(request.font_name.clone())],
        &Properties::new(),
    ) {
        Ok(handle) => {
            match handle {
                font_kit::handle::Handle::Path { path, font_index: _ } => path,
                font_kit::handle::Handle::Memory { .. } => {
                    return Err("Font is loaded from memory, not a file".to_string());
                }
            }
        }
        Err(e) => return Err(format!("Failed to find font: {:?}", e)),
    };

    // フォントファイルを読み込み
    let font_data = fs::read(&font_path)
        .map_err(|e| format!("Failed to read font file: {}", e))?;

    let face = ttf_parser::Face::parse(&font_data, 0)
        .map_err(|e| format!("Failed to parse font: {:?}", e))?;

    let units_per_em = face.units_per_em() as f64;
    let scale = request.font_size / units_per_em;

    // エクスポートモードの判定
    let is_path_only = request.export_mode == "path_only";
    let include_stroke = request.export_mode == "fill_and_stroke";

    // 有効なストロークレイヤーを取得（逆順で外側から）
    let enabled_stroke_layers: Vec<&StrokeLayer> = request.stroke_layers
        .iter()
        .filter(|l| l.enabled)
        .rev()
        .collect();

    if request.vertical {
        generate_vertical_svg(
            &font_data,
            &face,
            &request,
            scale,
            is_path_only,
            include_stroke,
            &enabled_stroke_layers,
        )
    } else {
        Ok(generate_horizontal_svg(
            &face,
            &request,
            scale,
            is_path_only,
            include_stroke,
            &enabled_stroke_layers,
        ))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_system_fonts,
            get_font_family_name,
            get_font_file_path,
            get_exe_dir,
            generate_svg
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
