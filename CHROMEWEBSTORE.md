# Chrome Web Store Listing — HoldTab - Background Link Opener

> Last Updated: 2026-10-12

## Store Listing

**Extension Name** [REQUIRED]
HoldTab - Background Link Opener

**Short Description** [REQUIRED]
Open links in background tabs without leaving your current tab using mouse gestures like long-press hold.

**Detailed Description** [REQUIRED]
Open any link in a background tab without leaving your current tab or losing your reading flow.

HoldTab adds an intuitive mouse gesture to your browser: simply hold down the left mouse button on any link for a brief moment (default 450ms), and a sleek progress ring animates around your cursor. Once filled, the link immediately opens in a background tab next to your current tab, leaving your current page uninterrupted.

Key Features:
- Long-Press Hold Gesture: Open any link in a background tab without moving your hands to the keyboard or middle-clicking.
- Visual Progress Ring: Watch an animated circular timer fill around your cursor so you always know when the tab will open.
- Safe Cancellation: Lift your finger early or move your mouse to cancel the gesture instantly and click normally.
- Customizable Hold Duration: Tune the hold time anywhere from 200ms to 1200ms with a real-time slider and interactive test arena.
- Optional Drag/Flick Gesture: Flick or drag a link slightly to open it in the background.
- Tab Placement Control: Choose whether background tabs open right next to your current tab or at the end of your tab strip.
- Domain Blacklist: Exclude specific websites with one click or manage an exclusions list.
- Clean & Lightweight: Zero external dependencies, runs smoothly, and does not alter page styling.

How to Use:
1. Hover your cursor over any link on any website.
2. Press and hold down the left mouse button.
3. Watch the animated circular ring complete.
4. Release: your new tab is opened in the background!

Privacy & Permissions:
HoldTab operates locally in your browser. It does not track, collect, store, or transmit your browsing history, personal data, or URLs to any external servers.

Support & Feedback:
If you have suggestions, bug reports, or feature requests, feel free to submit feedback or open an issue on the repository.

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Opens web links in background tabs without leaving the current tab using customizable mouse gestures.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | `docs/screenshot-hold-gesture.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | `docs/screenshot-settings-popup.png` |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | `docs/promo-tile.png` |

### Screenshot Notes
- Screenshot 1: Demonstrates the circular progress ring animating around cursor on a webpage link with a background tab appearing.
- Screenshot 2: Displays the HoldTab settings popup showing the live test arena, duration slider, and customizable options.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `tabs` | permissions | Required to create new tabs in the background without activating them, and to place tabs adjacent to the user's currently active tab. |
| `storage` | permissions | Required to save user preferences (hold duration, tab placement, domain exclusions) and sync them across browser sessions. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://github.com/your-username/holdtab-extension/blob/main/PRIVACY.md

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
HoldTab Team

**Contact Email** [REQUIRED]
developer@holdtab.local

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-10-12 | Initial release with long-press hold, radial SVG animation, settings popup, and test sandbox | Draft |

## Review Notes

### Known Issues / Limitations
- Does not trigger on browser-internal pages (`chrome://*`, `edge://*`) as extensions cannot inject content scripts into internal browser settings.
