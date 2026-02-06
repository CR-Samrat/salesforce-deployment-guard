# Change Log

All notable changes to the "Salesforce Deployment Guard" extension will be documented in this file.

## [0.3.0] - 2026-02-07

### Added
- 🔒 SOQL injection protection for all database queries
- ⚡ Connection pooling (30-minute cache) for improved performance
- 🎯 LWC multi-file diff checker - now handles bundles with multiple files of same type
- 📊 Sync Status Viewer - view all tracked files and their sync timestamps

### Changed
- 🎨 Moved "Merge Manually" button to first position for better UX
- 🗑️ Removed redundant "Deployment successful" message (already shown by SF Extension Pack)

### Fixed
- 🐛 LWC components with multiple .js, .html, or .css files now diff correctly
- 🐛 File retrieval now uses unique temp file names to prevent conflicts
- 🐛 SOQL queries now target specific files by name, not just extension

### Performance
- 40-50% faster conflict checks (connection pooling)
- Reduced API calls through intelligent caching

## [0.2.0] - 2025-02-05

### 🎯 Major Update - Global Protect & VPN Compatibility

### Changed
- **BREAKING FIX**: Replaced Salesforce CLI SOQL queries with `@salesforce/core` SDK
- Migrated from `sf data query` commands to direct API calls using `jsforce`
- Now only uses CLI for `sf org display --json` (username retrieval)

### Added
- New dependency: `@salesforce/core` (^6.5.0)
- New dependency: `jsforce` (^2.0.0)
- New helper function: `getSalesforceConnection()` for centralized connection management

### Fixed
- ✅ **Resolved SELF_SIGNED_CERTIFICATE_IN_CHAIN error** when using Global Protect VPN
- ✅ **Resolved certificate issues** with corporate proxy/VPN services
- ✅ Extension now works seamlessly with enterprise VPN solutions
- Improved error messages for connection failures

### Performance
- 🚀 Queries are 25-50% faster (direct API vs CLI overhead)
- Reduced process spawning overhead
- More reliable network communication

### Security
- No manual certificate configuration required
- Uses VSCode's Node environment for API calls
- Maintains same authentication security as before

## [0.1.1] - 2025-02-03

### Fixed
- Added detailed error messages when conflict detection fails

### Changed
- Conditional use of Tooling API based on metadata type (LightningComponentBundle)

## [0.1.0] - 2025-01-26

### Added
- Initial release
- Conflict detection for Apex and LWC files
- Tracked retrieve command
- Safe deploy command
- Visual diff viewer for conflict resolution
- Support for .cls, .trigger, .apex, .js, .html, .css files

---

## Upgrade Notes

### From 0.1.x to 0.2.0

**For End Users:**
- Simply update the extension from the marketplace
- No configuration changes needed
- All features work identically

**For Developers:**
- Run `npm install` to get new dependencies
- Recompile: `npm run compile`
- Test with Global Protect enabled to verify fix

**System Requirements:**
- VSCode: ^1.85.0 (unchanged)
- Node.js: 18.x or higher (unchanged)
- Salesforce CLI: v2.x (unchanged)
- SF org authentication required (unchanged)