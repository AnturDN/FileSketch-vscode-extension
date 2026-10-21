const vscode = require('vscode');
const path = require('path');

let activePanel = undefined;
let currentFileUri = undefined;

function getStorageKey(uri) {
    if (!uri) return 'default';
    const uriStr = uri.toString();

    let hash = 0x811c9dc5;
    for (let i = 0; i < uriStr.length; i++) {
        hash ^= uriStr.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    const hashHex = (hash >>> 0).toString(16).padStart(8, '0');
    const basename = path.basename(uri.fsPath).replace(/[^a-zA-Z0-9._-]/g, '_');
    return `${hashHex}_${basename}.json`;
}

function activate(context) {
    const ensureStorageDir = async () => {
        try {
            await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        } catch (e) {}
    };

    const loadNote = async (uri) => {
        await ensureStorageDir();
        const key = getStorageKey(uri);
        const fileUri = vscode.Uri.joinPath(context.globalStorageUri, key);
        try {
            const dataBytes = await vscode.workspace.fs.readFile(fileUri);
            return JSON.parse(Buffer.from(dataBytes).toString('utf8')); 
        } catch {
            return null;
        }
    };

    const saveNote = async (uri, drawingData, panData, zoomData) => {
        await ensureStorageDir();
        const key = getStorageKey(uri);
        const fileUri = vscode.Uri.joinPath(context.globalStorageUri, key);
        const payload = JSON.stringify({ drawing: drawingData, pan: panData, zoom: zoomData, timestamp: Date.now() });
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(payload, 'utf8'));
    };

    const trackActiveEditor = async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !activePanel) return;

        const newUri = activeEditor.document.uri;
        if (currentFileUri && currentFileUri.toString() === newUri.toString()) return;

        currentFileUri = newUri;
        const fileName = path.basename(newUri.fsPath);
        
        activePanel.title = `📝 FileSketch: ${fileName}`;
        const fileData = await loadNote(newUri);
        const drawing = fileData ? fileData.drawing : null;
        const loadedPan = fileData && fileData.pan ? fileData.pan : { x: 0, y: 0 };
        const loadedZoom = fileData && fileData.zoom ? fileData.zoom : 1.0;
        activePanel.webview.postMessage({ command: 'loadFile', drawing, fileName, fileUriStr: currentFileUri.toString(), pan: loadedPan, zoom: loadedZoom });
    };

    const toggleCommand = vscode.commands.registerCommand('filesketch.toggle', async () => {
        if (activePanel) {
            activePanel.dispose();
            return;
        }

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showInformationMessage('Please open a file first to take notes.');
            return;
        }

        currentFileUri = activeEditor.document.uri;
        const fileName = path.basename(currentFileUri.fsPath);

        activePanel = vscode.window.createWebviewPanel(
            'filesketch',
            `📝 FileSketch: ${fileName}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        activePanel.webview.html = getWebviewContent();

        activePanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'webviewReady':
                    const fileData = await loadNote(currentFileUri);
                    const drawing = fileData ? fileData.drawing : null;
                    const loadedPan = fileData && fileData.pan ? fileData.pan : { x: 0, y: 0 };
                    const loadedZoom = fileData && fileData.zoom ? fileData.zoom : 1.0;
                    activePanel.webview.postMessage({ command: 'loadFile', drawing, fileName, fileUriStr: currentFileUri.toString(), pan: loadedPan, zoom: loadedZoom });
                    break;
                case 'save':
                    if (currentFileUri) {
                        await saveNote(currentFileUri, message.data, message.pan, message.zoom);
                    }
                    break;
            }
        });

        activePanel.onDidDispose(() => {
            activePanel = undefined;
            currentFileUri = undefined;
        });

        vscode.window.onDidChangeActiveColorTheme(() => {
            if (activePanel) {
                activePanel.webview.postMessage({ command: 'themeChanged' });
            }
        });
    });

    class FileSketchSerializer {
        async deserializeWebviewPanel(webviewPanel, state) {
            if (!state || !state.fileUri) {
                webviewPanel.dispose();
                return;
            }
            activePanel = webviewPanel;
            currentFileUri = vscode.Uri.parse(state.fileUri);
            const fileName = state.fileName || path.basename(currentFileUri.fsPath);
            activePanel.webview.html = getWebviewContent();
            activePanel.webview.onDidReceiveMessage(async (message) => {
                switch (message.command) {
                    case 'webviewReady':
                        const fileData = await loadNote(currentFileUri);
                        const drawing = fileData ? fileData.drawing : null;
                        const loadedPan = fileData && fileData.pan ? fileData.pan : { x: 0, y: 0 };
                        const loadedZoom = fileData && fileData.zoom ? fileData.zoom : 1.0;
                        activePanel.webview.postMessage({ command: 'loadFile', drawing, fileName, fileUriStr: currentFileUri.toString(), pan: loadedPan, zoom: loadedZoom });
                        break;
                    case 'save':
                        if (currentFileUri) {
                            await saveNote(currentFileUri, message.data, message.pan, message.zoom);
                        }
                        break;
                }
            });
            activePanel.onDidDispose(() => {
                activePanel = undefined;
                currentFileUri = undefined;
            });
        }
    }

    const editorListener = vscode.window.onDidChangeActiveTextEditor(trackActiveEditor);
    context.subscriptions.push(
        toggleCommand, 
        editorListener,
        vscode.window.registerWebviewPanelSerializer('filesketch', new FileSketchSerializer())
    );
}

function getWebviewContent() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            --bg-color: var(--vscode-editor-background, #1e1e1e);
            --fg-color: var(--vscode-editor-foreground, #cccccc);
            --toolbar-bg: var(--vscode-editorWidget-background, #252526);
            --toolbar-border: var(--vscode-editorWidget-border, #454545);
            --active-bg: var(--vscode-button-background, #0e639c);
            --active-fg: var(--vscode-button-foreground, #ffffff);
        }

        html, body {
            margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden;
            background-color: var(--bg-color); color: var(--fg-color);
            font-family: var(--vscode-font-family, sans-serif); user-select: none;
        }

        .canvas-container {
            position: relative; width: 100%; height: 100%; background-size: 20px 20px;
            background-image: 
                linear-gradient(to right, rgba(128, 128, 128, 0.08) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(128, 128, 128, 0.08) 1px, transparent 1px);
        }

        canvas {
            display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            touch-action: none;
        }

        .toolbar {
            position: absolute; top: 10px; left: 10px; display: grid;
            grid-template-columns: repeat(2, 26px); gap: 4px; background-color: var(--toolbar-bg);
            border: 1px solid var(--toolbar-border); padding: 6px; border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.35); z-index: 10;
        }

        .tool-btn {
            background: transparent; border: none; color: var(--fg-color); width: 26px; height: 26px;
            border-radius: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: all 0.15s ease;
        }

        .tool-btn svg { width: 14px; height: 14px; stroke-width: 2; transition: transform 0.1s ease; }
        .tool-btn:hover { background-color: rgba(128, 128, 128, 0.15); }
        .tool-btn:active svg { transform: scale(0.9); }
        .tool-btn.active { background-color: var(--active-bg); color: var(--active-fg); }

        .divider-full { grid-column: span 2; height: 1px; background-color: var(--toolbar-border); margin: 2px 0; width: 100%; }
        .slider-full { grid-column: span 2; display: flex; align-items: center; gap: 4px; width: 100%; }
        input[type="range"] { flex-grow: 1; width: 100%; accent-color: var(--active-bg); cursor: pointer; margin: 0; padding: 0; }
        .color-full { grid-column: span 2; display: flex; align-items: center; justify-content: center; width: 100%; }

        input[type="color"] {
            border: none; width: 20px; height: 20px; border-radius: 50%; cursor: pointer;
            padding: 0; background: none; outline: none;
        }
        input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
        input[type="color"]::-webkit-color-swatch { border: 1px solid var(--toolbar-border); border-radius: 50%; }

        #size-display { font-size: 8px; color: var(--fg-color); opacity: 0.8; font-weight: bold; min-width: 20px; }

        #file-indicator {
            position: absolute; bottom: 12px; right: 15px; background: rgba(0, 0, 0, 0.5);
            color: #aaa; padding: 4px 10px; border-radius: 10px; font-size: 11px; pointer-events: none;
        }
    </style>
</head>

<body>
    <div class="canvas-container">
        <div class="toolbar">
            <button id="btn-select" class="tool-btn active" title="Select/Move/Resize (S)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4l7.2 16 3.2-6.8L21.2 10zM4 4l10.4 10.4"/></svg>
            </button>
            <button id="btn-hand" class="tool-btn" title="Hand/Pan Board (Spacebar + Drag)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 11V6a2 2 0 00-4 0v5m-4 0V4a2 2 0 00-4 0v7M6 11V8a2 2 0 00-4 0v11a5 5 0 0010 0v-4m4 4v-8a2 2 0 00-4 0v8"/></svg>
            </button>
            
            <button id="btn-pen" class="tool-btn" title="Pen (P)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button id="btn-eraser" class="tool-btn" title="Eraser (E)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
            </button>
            
            <button id="btn-text" class="tool-btn" title="Text Box (T)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
            </button>
            <button id="btn-arrow" class="tool-btn" title="Arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 19L19 5M19 5H10M19 5v9"/></svg>
            </button>
            
            <div class="divider-full"></div>
            
            <button id="btn-rect" class="tool-btn" title="Rectangle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </button>
            <button id="btn-circle" class="tool-btn" title="Circle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/></svg>
            </button>
            
            <button id="btn-triangle" class="tool-btn" title="Triangle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3L2 20h20L12 3z"/></svg>
            </button>
            <button id="btn-zoom-reset" class="tool-btn" title="Reset Zoom">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
            </button>
            
            <div class="divider-full"></div>
            
            <button id="btn-zoom-in" class="tool-btn" title="Zoom In">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/></svg>
            </button>
            <button id="btn-zoom-out" class="tool-btn" title="Zoom Out">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M8 11h6"/></svg>
            </button>
            
            <button id="btn-undo" class="tool-btn" title="Undo (Ctrl+Z)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 7v6h6M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>
            </button>
            <button id="btn-redo" class="tool-btn" title="Redo (Ctrl+Y / Ctrl+Shift+Z)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 7v6h-6M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/></svg>
            </button>
            
            <div class="divider-full"></div>
            <button id="btn-clear" class="tool-btn" style="color: #f44336; grid-column: span 2; width: auto;" title="Clear Note">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>
            </button>
            
            <div class="divider-full"></div>
            
            <div class="color-full" title="Pick Color">
                <input type="color" id="brush-color" value="#e06c75">
            </div>
            
            <div class="slider-full">
                <input type="range" id="brush-size" min="1" max="40" value="4" title="Brush Size">
                <span id="size-display">4px</span>
            </div>
        </div>

        <canvas id="paint-canvas"></canvas>
        <div id="file-indicator">No File Loaded</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const canvas = document.getElementById('paint-canvas');
        const ctx = canvas.getContext('2d');
        const fileIndicator = document.getElementById('file-indicator');

        const vscodeFontFamily = window.getComputedStyle(document.body).fontFamily || 'sans-serif';

        let currentTool = 'select'; 
        let brushColor = '#e06c75';
        let brushSize = 4;
        
        let isDrawing = false;
        let p1 = { x: 0, y: 0 }; 
        let p2 = { x: 0, y: 0 }; 

        let zoom = 1.0;
        let pan = { x: 0, y: 0 };
        let isPanning = false;
        let panStart = { x: 0, y: 0 };
        let panOffsetStart = { x: 0, y: 0 };
        let isSpacePressed = false; 

        let elements = [];
        let selectedElements = []; 
        
        let isDraggingElements = false;
        let dragOffsetStart = { x: 0, y: 0 };
        let dragOrigElements = [];

        let isResizingElement = false;
        let activeResizeHandle = null;
        let resizeOrigBox = null;
        let resizeAnchor = null;
        let resizeOrigElement = null;

        let isErasing = false;
        let activePreviewElement = null;
        
        let historyStack = [];
        let redoStack = [];
        let clipboard = []; 

        let transactionState = null;
        let transactionActive = false;
        let didTransactionModify = false;

        let saveTimeout = null;

        document.querySelector('.toolbar').addEventListener('mousedown', (e) => e.stopPropagation());
        document.querySelector('.toolbar').addEventListener('touchstart', (e) => e.stopPropagation());

        function resizeCanvas() {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            drawAll();
        }
        window.addEventListener('resize', resizeCanvas);

        function saveState() {
            historyStack.push(JSON.stringify(elements));
            redoStack = []; 
        }

        function undo() {
            if (historyStack.length > 0) {
                redoStack.push(JSON.stringify(elements));
                const lastState = historyStack.pop();
                try {
                    elements = JSON.parse(lastState);
                    selectedElements = [];
                    drawAll();
                    triggerSave();
                } catch(e) {}
            }
        }

        function redo() {
            if (redoStack.length > 0) {
                historyStack.push(JSON.stringify(elements));
                const nextState = redoStack.pop();
                try {
                    elements = JSON.parse(nextState);
                    selectedElements = [];
                    drawAll();
                    triggerSave();
                } catch(e) {}
            }
        }

        function triggerSave() {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                vscode.postMessage({ command: 'save', data: elements, pan: pan, zoom: zoom });
            }, 300);
        }

        function getCoords(e) {
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const screenX = clientX - rect.left;
            const screenY = clientY - rect.top;
            return { x: (screenX - pan.x) / zoom, y: (screenY - pan.y) / zoom };
        }
        

        function getBoundingBox(el) {
            if (el.type === 'rect' || el.type === 'arrow') {
                return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
            } else if (el.type === 'circle') {
                const radius = Math.sqrt(Math.pow(el.x2 - el.x1, 2) + Math.pow(el.y2 - el.y1, 2));
                return { x: el.x1 - radius, y: el.y1 - radius, w: radius * 2, h: radius * 2 };
            } else if (el.type === 'triangle') {
                return { x: Math.min(el.x1, el.x2), y: Math.min(el.y1, el.y2), w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
            } else if (el.type === 'text') {
                const fontSize = Math.max(8, el.size);
                ctx.font = fontSize + 'px ' + vscodeFontFamily;
                const metrics = ctx.measureText(el.text);
                return { x: el.x - 4, y: el.y - fontSize / 2 - 4, w: metrics.width + 8, h: fontSize + 8 };
            } else if (el.type === 'path') {
                if (!el.points || !Array.isArray(el.points) || el.points.length < 1) return null;
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                el.points.forEach(p => {
                    if (p) {
                        if (p.x < minX) minX = p.x;
                        if (p.x > maxX) maxX = p.x;
                        if (p.y < minY) minY = p.y;
                        if (p.y > maxY) maxY = p.y;
                    }
                });
                if (minX === Infinity) return null;
                return { x: minX - 4, y: minY - 4, w: (maxX - minX) + 8, h: (maxY - minY) + 8 };
            }
            return null;
        }

        function getMultiBoundingBox(arr) {
            const validBoxes = arr.map(el => getBoundingBox(el)).filter(b => b !== null);
            if (validBoxes.length === 0) return null;
            let minX = Math.min(...validBoxes.map(b => b.x));
            let minY = Math.min(...validBoxes.map(b => b.y));
            let maxX = Math.max(...validBoxes.map(b => b.x + b.w));
            let maxY = Math.max(...validBoxes.map(b => b.y + b.h));
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }

        function getHitHandle(pos, box) {
            if (!box) return null;
            // Fix: Increased threshold to make it easier to grab handles
            const threshold = 14 / zoom; 
            const corners = [
                { x: box.x, y: box.y, id: 'TL' },
                { x: box.x + box.w, y: box.y, id: 'TR' },
                { x: box.x, y: box.y + box.h, id: 'BL' },
                { x: box.x + box.w, y: box.y + box.h, id: 'BR' }
            ];
            for (const c of corners) {
                const dist = Math.sqrt(Math.pow(pos.x - c.x, 2) + Math.pow(pos.y - c.y, 2));
                if (dist <= threshold) return c.id;
            }
            return null;
        }

        function drawAll() {
            const dpr = window.devicePixelRatio || 1;
            ctx.resetTransform();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'source-over';
            ctx.shadowBlur = 0;
            ctx.scale(dpr, dpr);
            ctx.translate(pan.x, pan.y);
            ctx.scale(zoom, zoom);

            elements.forEach(el => drawElement(el));
            if (activePreviewElement) drawElement(activePreviewElement);

            if (currentTool === 'select' && selectedElements.length > 0) {
                const box = getMultiBoundingBox(selectedElements);
                if (box) {
                
                    ctx.strokeStyle = 'var(--vscode-button-background, #0e639c)';
                    ctx.lineWidth = 1.2 / zoom; 
                    ctx.setLineDash([4 / zoom, 4 / zoom]); 
                    ctx.strokeRect(box.x, box.y, box.w, box.h);
                    ctx.setLineDash([]); 
                    
                    if (selectedElements.length === 1) {
                        const handleRadius = 4 / zoom;
                        ctx.fillStyle = '#ffffff';
                        ctx.strokeStyle = 'var(--vscode-button-background, #0e639c)';
                        ctx.lineWidth = 1.5 / zoom;

                        const corners = [
                            { x: box.x, y: box.y }, { x: box.x + box.w, y: box.y },
                            { x: box.x, y: box.y + box.h }, { x: box.x + box.w, y: box.y + box.h }
                        ];
                        corners.forEach(c => {
                            ctx.beginPath();
                            ctx.arc(c.x, c.y, handleRadius, 0, 2 * Math.PI);
                            ctx.fill(); ctx.stroke();
                        });
                    }
                }
            }
        }

        function drawElement(el) {
            ctx.lineWidth = el.size;
            ctx.strokeStyle = el.color;
            ctx.fillStyle = el.color;
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';

            if (el.type === 'path') {
                if (!el.points || !Array.isArray(el.points) || el.points.length < 1) return;
                ctx.beginPath();
                ctx.moveTo(el.points[0].x, el.points[0].y);
                for (let i = 1; i < el.points.length; i++) {
                    if (el.points[i]) ctx.lineTo(el.points[i].x, el.points[i].y);
                }
                ctx.stroke();
                
            } else if (el.type === 'rect') {
                ctx.beginPath();
                ctx.rect(el.x1, el.y1, el.x2 - el.x1, el.y2 - el.y1);
                ctx.stroke();
            } else if (el.type === 'circle') {
                ctx.beginPath();
                const radius = Math.sqrt(Math.pow(el.x2 - el.x1, 2) + Math.pow(el.y2 - el.y1, 2));
                ctx.arc(el.x1, el.y1, radius, 0, 2 * Math.PI);
                ctx.stroke();
            } else if (el.type === 'triangle') {
                ctx.beginPath();
                ctx.moveTo(el.x1 + (el.x2 - el.x1) / 2, el.y1);
                ctx.lineTo(el.x2, el.y2);
                ctx.lineTo(el.x1, el.y2);
                ctx.closePath();
                ctx.stroke();
            } else if (el.type === 'arrow') {
                const dx = el.x2 - el.x1; 
                const dy = el.y2 - el.y1;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);
                const headLength = Math.max(8, el.size * 3);

                ctx.lineJoin = 'miter';

                const lineEndX = el.x2 - headLength * Math.cos(angle);
                const lineEndY = el.y2 - headLength * Math.sin(angle);

                ctx.beginPath();
                ctx.moveTo(el.x1, el.y1);
                ctx.lineTo(lineEndX, lineEndY);
                ctx.stroke();

                if (dist > 5) {
                    const arrowAngle = Math.PI / 7;
                    ctx.beginPath();
                    ctx.moveTo(el.x2, el.y2); 
                    ctx.lineTo(el.x2 - headLength * Math.cos(angle - arrowAngle), el.y2 - headLength * Math.sin(angle - arrowAngle));
                    ctx.lineTo(el.x2 - headLength * Math.cos(angle + arrowAngle), el.y2 - headLength * Math.sin(angle + arrowAngle));
                    ctx.closePath();
                    ctx.fill();
                }
            } else if (el.type === 'text') {
                const fontSize = Math.max(8, el.size);
                ctx.font = fontSize + 'px ' + vscodeFontFamily;
                ctx.textBaseline = 'middle';
                ctx.fillText(el.text, el.x, el.y);
            }
        }

        function getDistanceToSegment(p, a, b) {
            const A = p.x - a.x; const B = p.y - a.y; const C = b.x - a.x; const dY = b.y - a.y;
            const dot = A * C + B * dY; const lenSq = C * C + dY * dY;
            let param = -1; if (lenSq !== 0) param = dot / lenSq;
            let xx, yy;
            if (param < 0) { xx = a.x; yy = a.y; } 
            else if (param > 1) { xx = b.x; yy = b.y; } 
            else { xx = a.x + param * C; yy = a.y + param * dY; }
            const dx = p.x - xx; const dy = p.y - yy;
            return Math.sqrt(dx * dx + dy * dy);
        }
        

        function hitTest(pos) {
            const threshold = Math.max(6, (brushSize + 4) / zoom);
            for (let i = elements.length - 1; i >= 0; i--) {
                const el = elements[i];
                
                if (el.type === 'text') {
                    const fontSize = Math.max(8, el.size);
                    ctx.font = fontSize + 'px ' + vscodeFontFamily;
                    const metrics = ctx.measureText(el.text);
                    const width = metrics.width; const height = fontSize;
                    if (pos.x >= el.x && pos.x <= el.x + width && pos.y >= el.y - height / 2 && pos.y <= el.y + height / 2) return el;
                } else if (el.type === 'rect') {
                    const a = { x: el.x1, y: el.y1 }; const b = { x: el.x2, y: el.y1 };
                    const c = { x: el.x2, y: el.y2 }; const d = { x: el.x1, y: el.y2 };
                    if (getDistanceToSegment(pos, a, b) <= threshold || getDistanceToSegment(pos, b, c) <= threshold ||
                        getDistanceToSegment(pos, c, d) <= threshold || getDistanceToSegment(pos, d, a) <= threshold) return el;
                } else if (el.type === 'circle') {
                    const dx = pos.x - el.x1; const dy = pos.y - el.y1;
                    const distToCenter = Math.sqrt(dx * dx + dy * dy);
                    const radius = Math.sqrt(Math.pow(el.x2 - el.x1, 2) + Math.pow(el.y2 - el.y1, 2));
                    if (Math.abs(distToCenter - radius) <= threshold) return el;
                    
                } else if (el.type === 'triangle') {
                    const a = { x: el.x1 + (el.x2 - el.x1) / 2, y: el.y1 };
                    const b = { x: el.x2, y: el.y2 };
                    const c = { x: el.x1, y: el.y2 };
                    if (getDistanceToSegment(pos, a, b) <= threshold || getDistanceToSegment(pos, b, c) <= threshold || getDistanceToSegment(pos, c, a) <= threshold) return el;
                } else if (el.type === 'arrow') {
                    if (getDistanceToSegment(pos, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) <= threshold) return el;
                    const distToEnd = Math.sqrt(Math.pow(pos.x - el.x2, 2) + Math.pow(pos.y - el.y2, 2));
                    if (distToEnd <= Math.max(12, el.size * 3)) return el;
                } else if (el.type === 'path') {
                    if (!el.points || !Array.isArray(el.points) || el.points.length < 2) continue;
                    for (let j = 0; j < el.points.length - 1; j++) {
                        if (el.points[j] && el.points[j+1]) {
                            if (getDistanceToSegment(pos, el.points[j], el.points[j+1]) <= threshold) return el;
                        }
                    }
                }
            }
            return null;
        }

        function createTextInput(pos) {
            if (document.getElementById('temp-text-input')) return;
            const input = document.createElement('input');
            input.type = 'text'; input.id = 'temp-text-input';
            const calculatedFontSize = Math.max(8, brushSize);
            const screenX = pos.x * zoom + pan.x; const screenY = pos.y * zoom + pan.y;

            input.style.position = 'absolute';
            input.style.left = screenX + 'px'; input.style.top = (screenY - ((calculatedFontSize * zoom) / 1.5)) + 'px';
            input.style.font = (calculatedFontSize * zoom) + 'px ' + vscodeFontFamily;
            input.style.color = brushColor; input.style.background = 'var(--bg-color)';
            input.style.border = '1px dashed var(--active-bg)'; input.style.outline = 'none';
            input.style.padding = '4px 8px'; input.style.borderRadius = '4px'; input.style.zIndex = '100'; input.style.minWidth = '120px';

            input.addEventListener('mousedown', (e) => e.stopPropagation());
            input.addEventListener('touchstart', (e) => e.stopPropagation());

            document.querySelector('.canvas-container').appendChild(input);
            setTimeout(() => input.focus(), 50);

            let isCommitted = false;
            const commitText = () => {
                if (isCommitted) return; isCommitted = true;
                const val = input.value.trim();
                if (val) {
                    saveState();
                    elements.push({ type: 'text', x: pos.x, y: pos.y, text: val, size: brushSize, color: brushColor });
                    triggerSave(); drawAll();
                }
                input.remove(); 
            };
            input.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') commitText();
                else if (e.key === 'Escape') { isCommitted = true; input.remove(); }
            });
            input.addEventListener('blur', commitText);
        }

        function updateCursor(hoverHandle = null) {
            if (hoverHandle) {
                canvas.style.cursor = (hoverHandle === 'TL' || hoverHandle === 'BR') ? 'nwse-resize' : 'nesw-resize';
                return;
            }
            if (currentTool === 'eraser') {
                const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>';
                canvas.style.cursor = 'url(data:image/svg+xml;utf8,' + encodeURIComponent(svg) + ') 4 20, auto';
            } else if (currentTool === 'pen') {
                const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
                canvas.style.cursor = 'url(data:image/svg+xml;utf8,' + encodeURIComponent(svg) + ') 4 20, auto';
            } else if (currentTool === 'hand') {
                canvas.style.cursor = isPanning ? 'grabbing' : 'grab';
            } else if (currentTool === 'select') {
                canvas.style.cursor = 'default';
            } else { canvas.style.cursor = 'crosshair'; }
        }

        function eraseAt(pos) {
            const hit = hitTest(pos);
            if (hit) {
                if (!didTransactionModify) didTransactionModify = true;
                elements = elements.filter(item => item !== hit);
                triggerSave(); drawAll();
            }
        }

        function copySelection() {
            if (selectedElements.length > 0) {
                clipboard = selectedElements.map(el => JSON.parse(JSON.stringify(el)));
            }
        }

        function cutSelection() {
            if (selectedElements.length > 0) {
                clipboard = selectedElements.map(el => JSON.parse(JSON.stringify(el)));
                saveState();
                elements = elements.filter(el => !selectedElements.includes(el));
                selectedElements = [];
                triggerSave(); drawAll();
            }
        }

        function pasteClipboard() {
            if (clipboard.length > 0) {
                saveState();
                const offset = 20;
                const pasted = clipboard.map(el => {
                    const clone = JSON.parse(JSON.stringify(el));
                    if (clone.type === 'text') {
                        clone.x += offset; clone.y += offset;
                    } else if (clone.type === 'path') {
                        clone.points = clone.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
                    } else {
                        clone.x1 += offset; clone.y1 += offset;
                        clone.x2 += offset; clone.y2 += offset;
                    }
                    return clone;
                });
                elements.push(...pasted);
                selectedElements = pasted; 
                triggerSave(); drawAll();
            }
        }

        function deleteSelection() {
            if (selectedElements.length > 0) {
                saveState();
                elements = elements.filter(el => !selectedElements.includes(el));
                selectedElements = [];
                triggerSave(); drawAll();
            }
        }
        
        function startDrawing(e) {
            if (e.target !== canvas) return;
            if (e.button && e.button !== 0 && e.button !== 1) return;
            const pos = getCoords(e);

            if (currentTool === 'hand' || isSpacePressed || e.button === 1) {
                isPanning = true;
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                panStart = { x: clientX, y: clientY };
                panOffsetStart = { ...pan };
                updateCursor();
                return;
            }

            transactionState = JSON.stringify(elements);
            transactionActive = true; didTransactionModify = false;

            if (currentTool === 'eraser') { isErasing = true; eraseAt(pos); return; }
            if (currentTool === 'text') { createTextInput(pos); return; }

            if (currentTool === 'select') {
                // Fix: Check for resize handle FIRST before doing hitTest on the body
                if (selectedElements.length === 1) {
                    const box = getBoundingBox(selectedElements[0]);
                    const hitHandle = getHitHandle(pos, box);
                    if (hitHandle) {
                        isResizingElement = true; activeResizeHandle = hitHandle;
                        resizeOrigBox = { ...box };
                        resizeOrigElement = JSON.parse(JSON.stringify(selectedElements[0]));
                        if (hitHandle === 'BR') resizeAnchor = { x: box.x, y: box.y };
                        else if (hitHandle === 'BL') resizeAnchor = { x: box.x + box.w, y: box.y };
                        else if (hitHandle === 'TR') resizeAnchor = { x: box.x, y: box.y + box.h };
                        else if (hitHandle === 'TL') resizeAnchor = { x: box.x + box.w, y: box.y + box.h };
                        return;
                    }
                }

                const hit = hitTest(pos);
                
                if (e.shiftKey) {
                    if (hit) {
                        if (selectedElements.includes(hit)) {
                            selectedElements = selectedElements.filter(el => el !== hit);
                        } else {
                            selectedElements.push(hit);
                        }
                    }
                    drawAll();
                    return;
                }

                if (hit) {
                    if (!selectedElements.includes(hit)) {
                        selectedElements = [hit];
                    }
                    isDraggingElements = true;
                    dragOffsetStart = { x: pos.x, y: pos.y };
                    dragOrigElements = selectedElements.map(el => JSON.parse(JSON.stringify(el)));
                } else {
                    selectedElements = [];
                }
                drawAll();
                return;
            }

            isDrawing = true; p1 = pos; p2 = pos;

            if (currentTool === 'pen') {
                const newPath = { type: 'path', points: [pos], size: brushSize, color: brushColor };
                elements.push(newPath); didTransactionModify = true;
            }
        }

        function draw(e) {
            if (isPanning) {
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                pan.x = panOffsetStart.x + (clientX - panStart.x);
                pan.y = panOffsetStart.y + (clientY - panStart.y);
                drawAll(); return;
            }

            const pos = getCoords(e);

            if (isErasing) { eraseAt(pos); return; }

            if (isResizingElement && selectedElements.length === 1 && resizeOrigBox && resizeAnchor) {
                didTransactionModify = true;
                const origDiag = Math.sqrt(resizeOrigBox.w * resizeOrigBox.w + resizeOrigBox.h * resizeOrigBox.h);
                const curDiag = Math.sqrt(Math.pow(pos.x - resizeAnchor.x, 2) + Math.pow(pos.y - resizeAnchor.y, 2));
                const scale = curDiag / origDiag;
                const orig = resizeOrigElement; const el = selectedElements[0]; const anchor = resizeAnchor;
                
                if (el.type === 'rect' || el.type === 'circle' || el.type === 'triangle' || el.type === 'arrow') {
                    let newW = resizeOrigBox.w; let newH = resizeOrigBox.h;
                    if (activeResizeHandle === 'BR') { newW = Math.max(8, pos.x - resizeAnchor.x); newH = Math.max(8, pos.y - resizeAnchor.y); } 
                    else if (activeResizeHandle === 'BL') { newW = Math.max(10, resizeAnchor.x - pos.x); newH = Math.max(10, pos.y - resizeAnchor.y); } 
                    else if (activeResizeHandle === 'TR') { newW = Math.max(10, pos.x - resizeAnchor.x); newH = Math.max(10, resizeAnchor.y - pos.y); } 
                    else if (activeResizeHandle === 'TL') { newW = Math.max(10, resizeAnchor.x - pos.x); newH = Math.max(10, resizeAnchor.y - pos.y); }
                    const scaleX = newW / resizeOrigBox.w; const scaleY = newH / resizeOrigBox.h;
                    el.x1 = anchor.x + (orig.x1 - anchor.x) * scaleX; el.y1 = anchor.y + (orig.y1 - anchor.y) * scaleY;
                    el.x2 = anchor.x + (orig.x2 - anchor.x) * scaleX; el.y2 = anchor.y + (orig.y2 - anchor.y) * scaleY;
                } else if (el.type === 'text') {
                    // Fix: Proper text resizing keeping left edge fixed and adjusting Y based on top/bottom
                    const origFontSize = Math.max(8, orig.size);
                    const newFontSize = Math.max(8, orig.size * scale);
                    el.size = newFontSize;
                    el.x = orig.x; 
                    
                    if (activeResizeHandle === 'BR' || activeResizeHandle === 'BL') {
                        // Top edge stays fixed
                        el.y = orig.y + (newFontSize - origFontSize) / 2;
                    } else {
                        // Bottom edge stays fixed
                        el.y = orig.y - (newFontSize - origFontSize) / 2;
                    }
                } else if (el.type === 'path') {
                    if (el.points && Array.isArray(el.points)) {
                        el.points.forEach((pt, idx) => {
                            if (pt && orig.points && orig.points[idx]) {
                                pt.x = anchor.x + (orig.points[idx].x - anchor.x) * scale;
                                pt.y = anchor.y + (orig.points[idx].y - anchor.y) * scale;
                            }
                        });
                    }
                }
                drawAll(); return;
            }

            if (isDraggingElements && selectedElements.length > 0) {
                const dx = pos.x - dragOffsetStart.x;
                const dy = pos.y - dragOffsetStart.y;
                if (dx !== 0 || dy !== 0) didTransactionModify = true;
                
                selectedElements.forEach((el, idx) => {
                    const orig = dragOrigElements[idx];
                    if (el.type === 'text') {
                        el.x = orig.x + dx; el.y = orig.y + dy;
                    } else if (el.type === 'path') {
                        el.points = orig.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
                    } else {
                        el.x1 = orig.x1 + dx; el.y1 = orig.y1 + dy;
                        el.x2 = orig.x2 + dx; el.y2 = orig.y2 + dy;
                    }
                });
                drawAll(); return;
            }

            if (currentTool === 'select' && selectedElements.length > 0 && !isDrawing) {
                const box = getMultiBoundingBox(selectedElements);
                const hoverHandle = (selectedElements.length === 1) ? getHitHandle(pos, box) : null;
                if (hoverHandle) { updateCursor(hoverHandle); return; } 
                else { updateCursor(); }
            }

            if (!isDrawing) return;

            if (currentTool === 'pen') {
                const currentPath = elements[elements.length - 1];
                if (currentPath && currentPath.type === 'path') currentPath.points.push(pos);
                drawAll();
            } else {
                activePreviewElement = { type: currentTool, x1: p1.x, y1: p1.y, x2: pos.x, y2: pos.y, size: brushSize, color: brushColor };
                drawAll();
            }
        }

        function stopDrawing(e) {
            if (isPanning) { isPanning = false; updateCursor(); return; }
            let shouldCommitHistory = false;

            if (isErasing) { isErasing = false; if (didTransactionModify) shouldCommitHistory = true; }
            if (isResizingElement) { isResizingElement = false; activeResizeHandle = null; if (didTransactionModify) shouldCommitHistory = true; }
            if (isDraggingElements) { isDraggingElements = false; if (didTransactionModify) shouldCommitHistory = true; }
            if (isDrawing) {
                isDrawing = false;
                if (activePreviewElement) {
                    elements.push(activePreviewElement); activePreviewElement = null; didTransactionModify = true;
                }
                if (didTransactionModify) shouldCommitHistory = true;
            }

            if (shouldCommitHistory && transactionState) {
                historyStack.push(transactionState); redoStack = []; triggerSave();
            }
            transactionState = null; didTransactionModify = false; drawAll();
        }

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        window.addEventListener('mouseup', stopDrawing);

        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawing(e); }, {passive: false});
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e); }, {passive: false});
        window.addEventListener('touchend', stopDrawing);

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
            const worldX = (mouseX - pan.x) / zoom; const worldY = (mouseY - pan.y) / zoom;
            let newZoom = zoom;
            if (e.deltaY < 0) newZoom *= 1.1; else newZoom /= 1.1;
            newZoom = Math.max(0.1, Math.min(8.0, newZoom));
            pan.x = mouseX - worldX * newZoom; pan.y = mouseY - worldY * newZoom;
            zoom = newZoom; drawAll();
        }, { passive: false });

        canvas.addEventListener('dblclick', (e) => {
            const pos = getCoords(e);
            const el = hitTest(pos);
            if (el && el.type === 'text') {
                const originalText = el.text;
                el.text = ''; drawAll();
                const input = document.createElement('input');
                input.type = 'text'; input.id = 'temp-text-input'; input.value = originalText;
                const calculatedFontSize = Math.max(8, el.size);
                const screenX = el.x * zoom + pan.x; const screenY = el.y * zoom + pan.y;

                input.style.position = 'absolute';
                input.style.left = screenX + 'px'; input.style.top = (screenY - ((calculatedFontSize * zoom) / 1.5)) + 'px';
                input.style.font = (calculatedFontSize * zoom) + 'px ' + vscodeFontFamily;
                input.style.color = brushColor; input.style.background = 'var(--bg-color)';
                input.style.border = '1px dashed var(--active-bg)'; input.style.outline = 'none';
                input.style.padding = '4px 8px'; input.style.borderRadius = '4px'; input.style.zIndex = '100'; input.style.minWidth = '120px';

                input.addEventListener('mousedown', (e) => e.stopPropagation());
                input.addEventListener('touchstart', (e) => e.stopPropagation());

                document.querySelector('.canvas-container').appendChild(input);
                setTimeout(() => input.focus(), 50);

                let isEditCommitted = false;
                const commitText = () => {
                    if (isEditCommitted) return; isEditCommitted = true;
                    const val = input.value.trim();
                    if (val) { saveState(); el.text = val; triggerSave(); drawAll(); } 
                    else { el.text = originalText; drawAll(); }
                    input.remove();
                };
                input.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitText();
                    else if (e.key === 'Escape') { isEditCommitted = true; el.text = originalText; drawAll(); input.remove(); }
                });
                input.addEventListener('blur', commitText);
            }
        });

        const btnSelect = document.getElementById('btn-select');
        const btnHand = document.getElementById('btn-hand');
        const btnPen = document.getElementById('btn-pen');
        const btnEraser = document.getElementById('btn-eraser');
        const btnText = document.getElementById('btn-text');
        const btnArrow = document.getElementById('btn-arrow');
        const btnRect = document.getElementById('btn-rect');
        const btnCircle = document.getElementById('btn-circle');
        const btnTriangle = document.getElementById('btn-triangle');
        const btnZoomReset = document.getElementById('btn-zoom-reset');
        const btnZoomIn = document.getElementById('btn-zoom-in');
        const btnZoomOut = document.getElementById('btn-zoom-out');
        const btnUndo = document.getElementById('btn-undo');
        const btnRedo = document.getElementById('btn-redo');
        const btnClear = document.getElementById('btn-clear');
        const brushColorInput = document.getElementById('brush-color');
        const brushSizeInput = document.getElementById('brush-size');
        const sizeDisplay = document.getElementById('size-display');

        function setActiveTool(tool, btn) {
            currentTool = tool;
            [btnSelect, btnHand, btnPen, btnEraser, btnText, btnArrow, btnRect, btnCircle, btnTriangle].forEach(b => b.classList.remove('active'));
            if (btn) btn.classList.add('active');
            selectedElements = []; drawAll(); updateCursor();
        }

        btnSelect.addEventListener('click', () => setActiveTool('select', btnSelect));
        btnHand.addEventListener('click', () => setActiveTool('hand', btnHand));
        btnPen.addEventListener('click', () => setActiveTool('pen', btnPen));
        btnEraser.addEventListener('click', () => setActiveTool('eraser', btnEraser));
        btnText.addEventListener('click', () => setActiveTool('text', btnText));
        btnArrow.addEventListener('click', () => setActiveTool('arrow', btnArrow));
        btnRect.addEventListener('click', () => setActiveTool('rect', btnRect));
        btnCircle.addEventListener('click', () => setActiveTool('circle', btnCircle));
        btnTriangle.addEventListener('click', () => setActiveTool('triangle', btnTriangle));

        btnZoomReset.addEventListener('click', () => { zoom = 1.0; pan = { x: 0, y: 0 }; drawAll(); triggerSave(); });
        btnZoomIn.addEventListener('click', () => { zoom = Math.min(8.0, zoom * 1.2); drawAll(); triggerSave(); });
        btnZoomOut.addEventListener('click', () => { zoom = Math.max(0.1, zoom / 1.2); drawAll(); triggerSave(); });

        btnUndo.addEventListener('click', undo);
        btnRedo.addEventListener('click', redo);

        btnClear.addEventListener('click', () => {
            saveState(); 
            elements = []; 
            selectedElements = []; 
            drawAll(); 
            triggerSave();
        });

        brushColorInput.addEventListener('input', (e) => {
            brushColor = e.target.value;
            if (selectedElements.length > 0 && currentTool === 'select') {
                saveState();
                selectedElements.forEach(el => el.color = brushColor);
                triggerSave(); drawAll();
            }
        });

        brushSizeInput.addEventListener('input', (e) => {
            brushSize = parseInt(e.target.value, 10);
            sizeDisplay.textContent = brushSize + 'px';
            if (selectedElements.length > 0 && currentTool === 'select') {
                saveState();
                selectedElements.forEach(el => el.size = brushSize);
                triggerSave(); drawAll();
            }
        });

        window.addEventListener('keydown', (e) => {
            if (document.getElementById('temp-text-input')) return; 
            
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
                e.preventDefault(); copySelection();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
                e.preventDefault(); cutSelection();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                e.preventDefault(); pasteClipboard();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                e.preventDefault(); 
                if (currentTool === 'select') { selectedElements = [...elements]; drawAll(); }
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedElements.length > 0) {
                    e.preventDefault(); deleteSelection();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault(); redo();
            } else if (e.code === 'Space') {
                if (!isSpacePressed) { isSpacePressed = true; updateCursor(); }
                e.preventDefault();
            } else if (e.key === 'Escape') {
                selectedElements = []; drawAll();
            } else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.metaKey) {
                setActiveTool('select', btnSelect);
            } else if (e.key.toLowerCase() === 'p') {
                setActiveTool('pen', btnPen);
            } else if (e.key.toLowerCase() === 'e') {
                setActiveTool('eraser', btnEraser);
            } else if (e.key.toLowerCase() === 't') {
                setActiveTool('text', btnText);
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.code === 'Space') { isSpacePressed = false; updateCursor(); }
        });

        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'loadFile':
                    fileIndicator.textContent = message.fileName || 'Unknown File';
                    elements = Array.isArray(message.drawing) ? message.drawing : [];
                    zoom = message.zoom ? message.zoom : 1.0; 
                    pan = message.pan ? message.pan : { x: 0, y: 0 };
                    historyStack = []; redoStack = []; selectedElements = [];
                    isDrawing = false; isPanning = false; isDraggingElements = false; isResizingElement = false;
                    drawAll();
                    vscode.setState({ fileUri: message.fileUriStr, fileName: message.fileName });
                    break;
                case 'themeChanged':
                    drawAll();
                    break;
            }
        });

        resizeCanvas();
        vscode.postMessage({ command: 'webviewReady' });
    </script>
</body>
</html>`;
}

module.exports = { activate };
