# HoldTab - Background Link Opener (Browser Extension)

> Open links in new background tabs without leaving your current tab using mouse gestures like long-press hold.

![HoldTab Preview](icons/icon-128.png)

## Why HoldTab?

When reading articles, browsing forums (Reddit, Hacker News), or researching, opening links in the background is the fastest way to browse. However:
- **Middle-clicking** is often awkward on trackpads or mice with stiff scroll wheels.
- **Ctrl + Click** requires taking a hand off your mouse to press the keyboard.
- **HoldTab** lets you simply **press and hold down the left mouse button on any link for a brief moment** (default: 450ms). An animated ring fills around your cursor, the link opens in the background, and your reading flow is never interrupted!

---

## Features

- ⏱️ **Long-Press Hold Gesture**: Click & hold on any link to open it in a background tab without navigating away.
- 🎯 **Smooth Radial Feedback**: A circular countdown ring smoothly animates around the cursor with a green success pulse when the tab opens.
- 🛡️ **Zero Interference & Click Suppression**: Releasing before completion or moving your mouse > 8px cancels the gesture immediately, preserving normal clicks and text selection. When hold completes, the subsequent click is suppressed so the current page doesn't navigate.
- 🎛️ **Live Test Arena**: Test and feel your configured hold duration right inside the extension popup before browsing.
- ⚡ **Adjustable Hold Duration**: Customizable from 200ms (fast) to 1200ms (deliberate).
- 🧭 **Tab Placement Control**: Choose whether new tabs open directly adjacent to your current tab (`index + 1`) or at the end of the tab bar.
- 🔀 **Optional Flick/Drag Mode**: Quick drag or flick of a link can also trigger background open.
- 🚫 **Domain Blacklist**: Exclude specific websites with one click.
- 🔒 **100% Private**: Runs entirely locally on your device with no tracking, analytics, or external calls.

---

## Installation Guide

### For Brave (and Chrome / Edge / Chromium)
Brave is built on Chromium and is 100% natively compatible with HoldTab:
1. Open Brave and navigate to `brave://extensions`.
2. Toggle **Developer mode** in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the project folder:
   ```
   c:\Users\ratho_t8utq3d\Documents\broswer extention for new tabs
   ```
5. Pin **HoldTab** to your browser toolbar.

### For Mozilla Firefox
HoldTab supports Firefox Manifest V3 and uses dual background script and service worker definitions:
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select the `manifest.json` file inside the project folder:
   ```
   c:\Users\ratho_t8utq3d\Documents\broswer extention for new tabs\manifest.json
   ```
4. HoldTab is immediately loaded and active in Firefox!

---

## How to Use HoldTab

### 1. Long-Press Hold Gesture (Default)
1. **Hover** over any clickable link on any webpage.
2. **Press & hold** down the left mouse button.
3. A circular progress ring will animate around your cursor.
4. When the countdown completes (~450ms default):
   - The ring pulses green with a centered **✓ checkmark**.
   - The link opens instantly in a **new background tab**.
   - The standard click is suppressed so your current page never navigates away.
5. **Release** your mouse button.

> **To Cancel**: Lift your finger before the ring completes, or move the mouse away. Normal clicking and text selection are preserved!

### 2. Quick Flick / Drag Gesture
1. In the extension popup, set **Gesture Trigger** to **"Flick/Drag"** or **"Both"**.
2. **Click and flick/drag** any link in any direction (up, right, down, or left).
3. A dynamic directional blue arrow tracks your cursor and rotates in your drag direction, while a distance ring fills toward 100%.
4. The moment you pass your configured distance (default: 35px), it pops green and opens the tab in the background!

> **To Cancel**: Release your mouse before reaching the pixel threshold to cancel the drag without opening.

### 3. Customizing Your Preferences (Popup Menu)
Click the **HoldTab icon** in your browser toolbar to open settings:
- **Gesture Trigger**: Switch between **Hold**, **Flick/Drag**, or **Both**.
- **Dynamic Sliders**:
  - **Hold Duration Slider** (200ms to 1200ms): Fine-tune how quickly links open.
  - **Flick Distance Slider** (15px to 100px): Adjust how far you need to drag/flick.
- **Tab Position**: Choose whether background tabs open **Next to current tab** or **At the end** of your tab bar.
- **Tab Focus**: Keep in **Background** (default) or switch to **Foreground** immediately.
- **Website Exclusions**: Click **+ Exclude This Site** to disable gestures on specific web apps, or manage custom blacklisted domains.
- **Live Test Arena**: An interactive sandbox inside the popup where you can test-drive your exact hold time and flick distance before browsing!

---

## How to Test

1. Open `test.html` in your browser by double-clicking it or opening `file:///c:/Users/ratho_t8utq3d/Documents/broswer%20extention%20for%20new%20tabs/test.html`.
2. Press and hold the left mouse button on any test link:
   - Watch the radial timer fill up around your cursor.
   - Upon completion, the link opens in a new background tab, and your current page stays right where it is.
3. Try flicking/dragging a link: watch the directional arrow follow your mouse and trigger the background tab!
4. Try a quick click: it navigates normally without opening background tabs.
5. Open the extension popup to try out the **Live Test Arena** and adjust your sliders to your liking.

---

## File Structure

```
├── manifest.json              # Manifest V3 extension configuration
├── background/
│   └── service-worker.js     # Background tab creation & event handling
├── content/
│   ├── content.js            # Gesture detection, SVG progress ring, click blocker
│   └── content.css           # Overlay styling
├── popup/
│   ├── popup.html            # Settings UI & interactive live-test arena
│   ├── popup.js              # Real-time settings sync & test arena logic
│   └── popup.css             # Polished modern theme
├── icons/
│   ├── icon-16.png           # 16x16 icon
│   ├── icon-48.png           # 48x48 icon
│   └── icon-128.png          # 128x128 icon
├── scripts/
│   └── generate-icons.js     # Zero-dependency PNG generator script
├── test.html                 # Interactive test playground
├── CHROMEWEBSTORE.md         # Store listing metadata and review checklist
└── README.md                 # Project documentation
```

---

## License

MIT
