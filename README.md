FileSketch 📝
Take high-fidelity, side-by-side visual notes, architectural sketches, and flowcharts directly alongside your active code editor in VS Code.

FileSketch provides a persistent, file-specific infinite whiteboard that automatically switches and saves with your files — without cluttering your workspace.

🌟 Key Features
File-Specific & Workspace-Preserving No clutter! Your sketches are automatically mapped to individual code files. Switching files instantly swaps your canvas context without creating extra .png or .json files in your active workspace directory.

Infinite Whiteboard (Zoom & Pan) Scale your board infinitely. Zoom in/out with Ctrl + Scroll, and pan around by holding Spacebar + Drag (Figma-style) or using the Hand tool.

Figma-Style Multi-Selection & Resizing Switch to the Select Tool (↖️) to select elements. Hold Shift to select multiple elements, or Ctrl + A to select all. Drag the bounding box's circular corner handles to scale individual elements with mathematically precise uniform scaling.

Clipboard Support (Copy/Cut/Paste) Easily duplicate your sketches. Use Ctrl + C to copy or Ctrl + X to cut single or multiple selected elements, and Ctrl + V to paste them anywhere on the board.

Flexible Deletion Delete a single element by selecting it and pressing Delete, or use the Eraser tool for quick swipes. Multiple selected elements can also be deleted all at once.

Dynamic Text Editing Click to type any text. Double-click on any existing text using the Select Tool to edit its content in-place, dynamically.

Sleek Vector Engine Every pencil stroke, shape (including sharp, pointy arrows), and text box is stored as a lightweight vector element. Drawings render beautifully at high-DPI on Retina/4K displays.

Continuous Drag Eraser Swipe across drawing strokes with a dynamic eraser cursor that adapts to your brush size, making cleanup quick and effortless.

Unlimited Undo/Redo History Complete peace of mind with an infinite history stack. Accidental "Clear Board" actions or deletions can be instantly reverted, with no limits.

Ultra-Compact Dual-Column Toolbar A beautifully optimized, ultra-thin vertical panel that fits comfortably even when your terminal is fully open.

⌨️ Advanced Keyboard Shortcuts
Efficiency is key. FileSketch supports standard design-tool hotkeys:

Action	Shortcut (Windows/Linux)	Shortcut (macOS)
Select / Move Tool	S	S
Hand / Pan Tool	H	H
Pen Tool	P	P
Eraser Tool	E	E
Text Tool	T	T
Pan Board	Spacebar + Drag	Spacebar + Drag
Zoom In/Out	Ctrl + Wheel Scroll	Cmd + Wheel Scroll
Multi-Select	Shift + Click	Shift + Click
Select All	Ctrl + A	Cmd + A
Copy	Ctrl + C	Cmd + C
Cut	Ctrl + X	Cmd + X
Paste	Ctrl + V	Cmd + V
Delete Selected	Delete / Backspace	Delete / Backspace
Undo	Ctrl + Z	Cmd + Z
Redo	Ctrl + Y / Ctrl + Shift + Z	Cmd + Y / Cmd + Shift + Z
⚙️ How It Works (Behind the Scenes)
FileSketch is engineered to protect your privacy and project integrity:

Zero Cloud Uploads — Your notes are stored 100% locally.
Local Application Storage — Notes are serialized into lightweight JSON arrays mapped to file hashes in VS Code's secure globalStorageUri directory.
DPI-Aware Canvas — Autodetects high-DPI monitors and scales the backing store automatically to prevent low-pixelated text or blurry lines.
🛠️ Manual Installation (VSIX)
If you downloaded the .vsix package manually:

Open VS Code.
Go to the Extensions view (Ctrl+Shift+X or Cmd+Shift+X).
Click the Views and More Actions (...) menu button at the top-right of the Extensions panel.
Select Install from VSIX...
Locate and select your filesketch-1.0.0.vsix file.
📄 License
This extension is released under the MIT License.
