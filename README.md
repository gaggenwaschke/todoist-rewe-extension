# Todoist REWE Integration

A Firefox extension that seamlessly syncs your Todoist shopping lists with REWE online shop. Transform your Todoist tasks into a ready-to-buy shopping cart with intelligent product matching and automated cart management.

## Features

- **API Token Authentication**: Secure integration with Todoist using personal API tokens
- **Intelligent Product Matching**: Advanced fuzzy search algorithms to match task names with REWE products
- **Interactive Product Selection**: When multiple products match, choose the correct one and save preferences for future use
- **Automated Cart Management**: Automatically add matched products to your REWE shopping cart
- **Product Mapping Memory**: Remembers your product choices to speed up future transfers
- **Customizable Settings**: Adjust similarity thresholds, search behavior, and other preferences
- **Export/Import Settings**: Backup and restore your configuration and product mappings

## Installation

### Prerequisites

1. **Todoist Account**: You need a Todoist account to get your personal API token
2. **Firefox Browser**: This extension is built for Firefox using Manifest V3
3. **REWE Account**: Access to shop.rewe.de for cart functionality

### Setup Instructions

1. **Clone or Download** this repository to your local machine

2. **Get Todoist API Token**:
   - Go to [Todoist Settings → Integrations](https://todoist.com/prefs/integrations)
   - Scroll down to find your API token
   - Copy the token (it looks like: `0123456789abcdef0123456789abcdef01234567`)

3. **Configure API Token**:
   - After loading the extension, click the extension icon
   - Go to "Settings" or right-click the extension and select "Options"
   - Enter your Todoist API token in the Authentication section
   - Click "Test Connection" to verify the token works

4. **Create Extension Icons**:
   - Replace the placeholder files in the `icons/` directory with actual PNG files:
     - `icon-16.png` (16x16 pixels)
     - `icon-48.png` (48x48 pixels)
     - `icon-128.png` (128x128 pixels)
   - Update `manifest.json` to remove `.placeholder` extensions

5. **Load Extension in Firefox**:
   - Open Firefox and go to `about:debugging`
   - Click "This Firefox"
   - Click "Load Temporary Add-on"
   - Navigate to your extension directory and select `manifest.json`

## Usage

### Initial Setup

1. **Open the Extension**: Click the extension icon in your Firefox toolbar
2. **Authenticate**: Click "Connect to Todoist" and follow the OAuth flow
3. **Configure Settings**: Optionally visit the settings page to customize behavior

### Basic Workflow

1. **Select Project**: Choose the Todoist project containing your shopping list
2. **Choose List/Section**: Select the specific list or section (optional)
3. **Add Tag Filter**: Enter a tag to filter tasks (e.g., "@shopping", "@groceries")
4. **Preview Tasks**: Review the tasks that will be transferred
5. **Transfer to REWE**: Click "Transfer to REWE" to process the items

### Product Matching

The extension uses intelligent algorithms to match your Todoist task names with REWE products:

- **Exact Match**: Perfect name matches get highest priority
- **Fuzzy Matching**: Similar names are scored by similarity percentage
- **User Decision**: When multiple products match, you choose the correct one
- **Memory**: Your choices are remembered for future transfers

### Handling Ambiguous Matches

When multiple products match a task:
1. A modal will show potential matches with similarity scores
2. Select the correct product
3. Click "Save Choice" to remember this mapping
4. The extension will use this mapping for future transfers

## Settings

Access settings through the extension popup or right-click → "Options":

### Search & Matching
- **Similarity Threshold**: Minimum score for automatic matching (default: 70%)
- **Max Search Results**: Maximum options shown for ambiguous matches (default: 5)
- **Fuzzy Matching**: Enable/disable advanced matching algorithms

### Shopping Preferences
- **Auto-open Cart**: Automatically open REWE cart after transfer
- **Show Notifications**: Display browser notifications for results
- **Default Tag**: Pre-fill tag filter with your preferred tag

### Data Management
- **Product Mappings**: View and manage saved product associations
- **Export/Import**: Backup and restore your settings and mappings

## Technical Details

### Architecture

- **Background Script**: Handles Todoist API communication and OAuth
- **Content Script**: Interacts with REWE website for product search and cart management
- **Popup Interface**: Main user interface for configuration and transfers
- **Options Page**: Settings management and advanced configuration

### Storage

- **Chrome Storage Sync**: Extension settings (synced across devices)
- **Chrome Storage Local**: OAuth tokens and product mappings (local only)

### Security

- OAuth tokens are stored securely in Chrome's encrypted storage
- No sensitive data is transmitted to external servers
- All communication uses HTTPS

### Browser Compatibility

- **Firefox**: Primary target (uses background scripts)
- **Chrome**: Requires changing manifest.json to use "service_worker" instead of "scripts"
- **Edge**: Requires changing manifest.json to use "service_worker" instead of "scripts"

## Development

### File Structure

```
todoist_rewe_extension/
├── manifest.json              # Extension manifest
├── background.js              # Background service worker
├── content/
│   └── rewe-content.js       # REWE website integration
├── popup/
│   ├── popup.html            # Main popup interface
│   ├── popup.js              # Popup functionality
│   └── popup.css             # Popup styling
├── options/
│   ├── options.html          # Settings page
│   ├── options.js            # Settings functionality
│   └── options.css           # Settings styling
├── icons/                    # Extension icons
└── README.md                 # This file
```

### Key Technologies

- **Vanilla JavaScript**: No external dependencies
- **Chrome Extensions API**: Manifest V3 compliance
- **CSS Grid/Flexbox**: Modern responsive layouts
- **Fuzzy String Matching**: Custom Levenshtein distance algorithm

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Troubleshooting

### Common Issues

**Authentication fails**:
- Check your Todoist API credentials
- Ensure redirect URI is correctly configured
- Verify extension ID matches redirect URI

**Products not found**:
- Try different task names (more specific or generic)
- Check if REWE website structure has changed
- Adjust similarity threshold in settings

**Extension not loading**:
- Check console for errors
- Verify all files are present
- Ensure manifest.json is valid

### Debug Mode

Enable debug logging by opening browser console:
- Background script logs: Available in extension service worker console
- Content script logs: Available in REWE website console
- Popup logs: Available in popup inspection console

## Privacy & Data

### Data Collection
- This extension does not collect or transmit personal data
- All data processing happens locally in your browser
- OAuth tokens are stored securely and never shared

### External Services
- **Todoist API**: Required for accessing your projects and tasks
- **REWE Website**: Required for product search and cart functionality
- No other external services are used

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, questions, or feature requests:
1. Check the troubleshooting section above
2. Search existing issues
3. Create a new issue with detailed information

## Version History

### v1.0.0
- Initial release
- OAuth 2.0 authentication with Todoist
- Product matching with fuzzy search
- Shopping cart integration
- Settings management
- Product mapping memory

---

**Note**: This extension is not officially affiliated with Todoist or REWE. It's a third-party integration tool created for personal productivity.
