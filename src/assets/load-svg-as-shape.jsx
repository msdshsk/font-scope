/**
 * SVG to Photoshop Shape Layer Converter
 * SVGファイルのpathをPhotoshopのシェイプレイヤーとして読み込む
 *
 * 対応コマンド: M, L, Q, Z (絶対座標)
 * 対応コマンド: m, l, q, z (相対座標)
 */

// ============================================
// SVG Path Parser
// ============================================

/**
 * SVGのpath d属性をパースしてコマンド配列に変換
 * @param {string} d - SVGのd属性値
 * @returns {Array} パースされたコマンド配列
 */
function parseSVGPath(d) {
    var commands = [];
    // コマンドと数値を分離する正規表現
    var regex = /([MmLlQqZz])|(-?\d+\.?\d*)/g;
    var match;
    var currentCommand = null;
    var args = [];

    while ((match = regex.exec(d)) !== null) {
        if (match[1]) {
            // 新しいコマンド
            if (currentCommand !== null) {
                commands.push({ cmd: currentCommand, args: args });
            }
            currentCommand = match[1];
            args = [];
        } else if (match[2]) {
            // 数値
            args.push(parseFloat(match[2]));
        }
    }

    // 最後のコマンドを追加
    if (currentCommand !== null) {
        commands.push({ cmd: currentCommand, args: args });
    }

    return commands;
}

/**
 * パースされたコマンドをPhotoshop用のポイント配列に変換
 * @param {Array} commands - パースされたコマンド配列
 * @returns {Array} サブパス配列（各サブパスはポイントの配列）
 */
function commandsToSubPaths(commands) {
    var subPaths = [];
    var currentSubPath = [];
    var currentX = 0;
    var currentY = 0;
    var startX = 0;
    var startY = 0;

    for (var i = 0; i < commands.length; i++) {
        var cmd = commands[i].cmd;
        var args = commands[i].args;
        var isRelative = (cmd === cmd.toLowerCase());
        var cmdUpper = cmd.toUpperCase();

        switch (cmdUpper) {
            case 'M':
                // 新しいサブパス開始
                if (currentSubPath.length > 0) {
                    subPaths.push(currentSubPath);
                    currentSubPath = [];
                }

                // 複数の座標ペアがある場合、最初はmoveto、残りはlineto
                for (var j = 0; j < args.length; j += 2) {
                    var x = args[j];
                    var y = args[j + 1];

                    if (isRelative && j > 0) {
                        x += currentX;
                        y += currentY;
                    } else if (isRelative && j === 0) {
                        x += currentX;
                        y += currentY;
                    }

                    if (j === 0) {
                        startX = x;
                        startY = y;
                    }

                    currentSubPath.push({
                        anchor: [x, y],
                        leftDirection: [x, y],
                        rightDirection: [x, y],
                        kind: PointKind.CORNERPOINT
                    });

                    currentX = x;
                    currentY = y;
                }
                break;

            case 'L':
                // 直線
                for (var j = 0; j < args.length; j += 2) {
                    var x = args[j];
                    var y = args[j + 1];

                    if (isRelative) {
                        x += currentX;
                        y += currentY;
                    }

                    currentSubPath.push({
                        anchor: [x, y],
                        leftDirection: [x, y],
                        rightDirection: [x, y],
                        kind: PointKind.CORNERPOINT
                    });

                    currentX = x;
                    currentY = y;
                }
                break;

            case 'Q':
                // 二次ベジェ曲線 (制御点1つ)
                // Photoshopは三次ベジェなので、二次→三次変換が必要
                for (var j = 0; j < args.length; j += 4) {
                    var cx = args[j];      // 制御点X
                    var cy = args[j + 1];  // 制御点Y
                    var ex = args[j + 2];  // 終点X
                    var ey = args[j + 3];  // 終点Y

                    if (isRelative) {
                        cx += currentX;
                        cy += currentY;
                        ex += currentX;
                        ey += currentY;
                    }

                    // 二次ベジェから三次ベジェへの変換
                    // CP1 = P0 + 2/3 * (CP - P0)
                    // CP2 = P1 + 2/3 * (CP - P1)
                    var cp1x = currentX + (2/3) * (cx - currentX);
                    var cp1y = currentY + (2/3) * (cy - currentY);
                    var cp2x = ex + (2/3) * (cx - ex);
                    var cp2y = ey + (2/3) * (cy - ey);

                    // 前のポイントのleftDirectionを更新（出ていく方向）
                    if (currentSubPath.length > 0) {
                        var lastPoint = currentSubPath[currentSubPath.length - 1];
                        lastPoint.leftDirection = [cp1x, cp1y];
                    }

                    // 終点を追加
                    currentSubPath.push({
                        anchor: [ex, ey],
                        leftDirection: [ex, ey],
                        rightDirection: [cp2x, cp2y],  // 入ってくる方向
                        kind: PointKind.CORNERPOINT
                    });

                    currentX = ex;
                    currentY = ey;
                }
                break;

            case 'Z':
                // パスを閉じる
                // 閉じたパスとしてマーク（後で処理）
                if (currentSubPath.length > 0) {
                    currentSubPath.closed = true;
                }
                currentX = startX;
                currentY = startY;
                break;
        }
    }

    // 最後のサブパスを追加
    if (currentSubPath.length > 0) {
        subPaths.push(currentSubPath);
    }

    return subPaths;
}

// ============================================
// Compound Path (Hole) Detection
// ============================================

/**
 * サブパスのバウンディングボックスを計算
 * @param {Array} subPath - ポイント配列
 * @returns {Object} バウンディングボックス {minX, minY, maxX, maxY, area}
 */
function getSubPathBounds(subPath) {
    var minX = Infinity, minY = Infinity;
    var maxX = -Infinity, maxY = -Infinity;

    for (var i = 0; i < subPath.length; i++) {
        var pt = subPath[i].anchor;
        if (pt[0] < minX) minX = pt[0];
        if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1];
        if (pt[1] > maxY) maxY = pt[1];
    }

    return {
        minX: minX,
        minY: minY,
        maxX: maxX,
        maxY: maxY,
        width: maxX - minX,
        height: maxY - minY,
        area: (maxX - minX) * (maxY - minY)
    };
}

/**
 * パスの符号付き面積を計算（向き判定用）
 * 正: 時計回り、負: 反時計回り（SVG座標系）
 * @param {Array} subPath - ポイント配列
 * @returns {number} 符号付き面積
 */
function getSignedArea(subPath) {
    var area = 0;
    var n = subPath.length;

    for (var i = 0; i < n; i++) {
        var j = (i + 1) % n;
        var pi = subPath[i].anchor;
        var pj = subPath[j].anchor;
        area += pi[0] * pj[1];
        area -= pj[0] * pi[1];
    }

    return area / 2;
}

/**
 * 点がバウンディングボックス内にあるかチェック
 * @param {Array} point - [x, y]
 * @param {Object} bounds - バウンディングボックス
 * @returns {boolean}
 */
function isPointInBounds(point, bounds) {
    return point[0] >= bounds.minX && point[0] <= bounds.maxX &&
           point[1] >= bounds.minY && point[1] <= bounds.maxY;
}

/**
 * バウンディングボックスAがBに含まれるかチェック
 * @param {Object} boundsA - 内側候補
 * @param {Object} boundsB - 外側候補
 * @returns {boolean}
 */
function isBoundsContained(boundsA, boundsB) {
    return boundsA.minX >= boundsB.minX && boundsA.maxX <= boundsB.maxX &&
           boundsA.minY >= boundsB.minY && boundsA.maxY <= boundsB.maxY;
}

/**
 * サブパス配列の各パスに対して、外側（ADD）か内側（SUBTRACT）かを判定
 * @param {Array} subPaths - サブパス配列
 * @returns {Array} 各サブパスのオペレーション配列
 */
function determinePathOperations(subPaths) {
    var operations = [];
    var boundsArray = [];

    // 各サブパスのバウンディングボックスと面積を計算
    for (var i = 0; i < subPaths.length; i++) {
        boundsArray.push(getSubPathBounds(subPaths[i]));
    }

    // 各サブパスについて、他のパスに含まれているかチェック
    for (var i = 0; i < subPaths.length; i++) {
        var containCount = 0;

        for (var j = 0; j < subPaths.length; j++) {
            if (i === j) continue;

            // バウンディングボックスで簡易判定
            if (isBoundsContained(boundsArray[i], boundsArray[j])) {
                // より厳密には、パスの中心点が他のパス内にあるかチェック
                containCount++;
            }
        }

        // 奇数回含まれていれば穴（SUBTRACT）、偶数回なら外側（ADD）
        // これはeven-odd fill ruleに対応
        if (containCount % 2 === 1) {
            operations.push(ShapeOperation.SHAPESUBTRACT);
        } else {
            operations.push(ShapeOperation.SHAPEADD);
        }
    }

    return operations;
}

// ============================================
// Photoshop Path Creation
// ============================================

/**
 * サブパス配列からPhotoshopのPathItemを作成
 * @param {Document} doc - 対象ドキュメント
 * @param {Array} subPaths - サブパス配列
 * @param {string} pathName - パス名
 * @returns {PathItem} 作成されたパス
 */
function createPathFromSubPaths(doc, subPaths, pathName) {
    var pathPointInfoArray = [];

    // 各サブパスのオペレーション（ADD/SUBTRACT）を判定
    var operations = determinePathOperations(subPaths);

    for (var i = 0; i < subPaths.length; i++) {
        var subPath = subPaths[i];
        var pointArray = [];

        for (var j = 0; j < subPath.length; j++) {
            var pt = subPath[j];
            var pointInfo = new PathPointInfo();

            pointInfo.anchor = pt.anchor;
            pointInfo.leftDirection = pt.leftDirection;
            pointInfo.rightDirection = pt.rightDirection;
            pointInfo.kind = pt.kind;

            pointArray.push(pointInfo);
        }

        var subPathInfo = new SubPathInfo();
        subPathInfo.operation = operations[i];  // ADD or SUBTRACT
        subPathInfo.closed = subPath.closed || false;
        subPathInfo.entireSubPath = pointArray;

        pathPointInfoArray.push(subPathInfo);
    }

    return doc.pathItems.add(pathName, pathPointInfoArray);
}

/**
 * パスをシェイプレイヤーに変換
 * @param {PathItem} pathItem - 変換するパス
 * @param {Array} color - RGB色 [r, g, b] (0-255)
 */
function convertPathToShape(pathItem, color) {
    // ActionDescriptorを使用してシェイプレイヤーを作成
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putClass(stringIDToTypeID("contentLayer"));
    desc.putReference(stringIDToTypeID("null"), ref);

    var shapeDesc = new ActionDescriptor();
    var colorDesc = new ActionDescriptor();
    var rgbDesc = new ActionDescriptor();

    rgbDesc.putDouble(stringIDToTypeID("red"), color[0]);
    rgbDesc.putDouble(stringIDToTypeID("green"), color[1]);
    rgbDesc.putDouble(stringIDToTypeID("blue"), color[2]);

    colorDesc.putObject(stringIDToTypeID("color"), stringIDToTypeID("RGBColor"), rgbDesc);
    shapeDesc.putObject(stringIDToTypeID("type"), stringIDToTypeID("solidColorLayer"), colorDesc);
    desc.putObject(stringIDToTypeID("using"), stringIDToTypeID("contentLayer"), shapeDesc);

    executeAction(stringIDToTypeID("make"), desc, DialogModes.NO);
}

// ============================================
// SVG File Processing
// ============================================

/**
 * SVGファイルを読み込んでパース
 * @param {File} file - SVGファイル
 * @returns {Object} パースされたSVG情報
 */
function loadSVGFile(file) {
    file.open('r');
    var content = file.read();
    file.close();

    // viewBox属性を取得
    var viewBoxMatch = content.match(/viewBox="([^"]+)"/);
    var viewBox = { x: 0, y: 0, width: 260, height: 1102 };
    if (viewBoxMatch) {
        var vb = viewBoxMatch[1].split(/\s+/);
        viewBox = {
            x: parseFloat(vb[0]),
            y: parseFloat(vb[1]),
            width: parseFloat(vb[2]),
            height: parseFloat(vb[3])
        };
    }

    // width/height属性を取得
    var widthMatch = content.match(/width="(\d+)"/);
    var heightMatch = content.match(/height="(\d+)"/);
    var width = widthMatch ? parseFloat(widthMatch[1]) : viewBox.width;
    var height = heightMatch ? parseFloat(heightMatch[1]) : viewBox.height;

    // グループとパスを抽出
    var groups = [];
    var groupRegex = /<g[^>]*id="([^"]*)"[^>]*data-char="([^"]*)"[^>]*>\s*<path[^>]*d="([^"]+)"[^>]*\/>\s*<\/g>/g;
    var match;

    while ((match = groupRegex.exec(content)) !== null) {
        groups.push({
            id: match[1],
            glyph: match[2],
            d: match[3]
        });
    }

    // グループがない場合、直接pathを探す
    if (groups.length === 0) {
        var pathRegex = /<path[^>]*d="([^"]+)"[^>]*\/>/g;
        var pathIndex = 0;
        while ((match = pathRegex.exec(content)) !== null) {
            groups.push({
                id: 'path-' + pathIndex,
                glyph: '',
                d: match[1]
            });
            pathIndex++;
        }
    }

    return {
        width: width,
        height: height,
        viewBox: viewBox,
        groups: groups
    };
}

// ============================================
// Main Function
// ============================================

function main() {
    // ファイル選択ダイアログ
    var svgFile = File.openDialog("SVGファイルを選択", "SVG Files:*.svg");
    if (!svgFile) {
        return;
    }

    // SVGをパース
    var svgData = loadSVGFile(svgFile);

    if (svgData.groups.length === 0) {
        alert("SVGファイル内にpathが見つかりませんでした。");
        return;
    }

    // 新しいドキュメントを作成
    var doc = app.documents.add(
        UnitValue(svgData.width, "px"),
        UnitValue(svgData.height, "px"),
        72,
        svgFile.name.replace('.svg', ''),
        NewDocumentMode.RGB,
        DocumentFill.WHITE
    );

    // 各グループ（文字）を処理
    for (var i = 0; i < svgData.groups.length; i++) {
        var group = svgData.groups[i];
        var pathName = group.glyph ? group.glyph + " (" + group.id + ")" : group.id;

        // パスデータをパース
        var commands = parseSVGPath(group.d);
        var subPaths = commandsToSubPaths(commands);

        // Photoshopパスを作成
        var pathItem = createPathFromSubPaths(doc, subPaths, pathName);

        // シェイプレイヤーに変換（黒色）
        convertPathToShape(pathItem, [0, 0, 0]);

        // レイヤー名を設定
        doc.activeLayer.name = pathName;
    }

    // 背景レイヤーを削除（オプション）
    // doc.backgroundLayer.remove();

    alert("完了: " + svgData.groups.length + " 個のシェイプレイヤーを作成しました。");
}

// 実行
main();
