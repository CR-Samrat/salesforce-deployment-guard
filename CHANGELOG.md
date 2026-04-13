# Change Log

All notable changes to the "Salesforce Deployment Guard" extension will be documented in this file.

## [0.6.1] - 2026-04-13
- Minor bug fixes

## [0.6.0] - 2026-04-06
 
### 🎉 Major Update - Enhanced Backup Management
 
### Added
- **Take Immediate Backup** - New command to manually backup files anytime
  - No need to wait for deployment
  - Right-click → "SF Guard: Take Backup"
  - Creates timestamped backup instantly
  
- **Backup Management Features** - Full control over your backups
  - **Rename Backups** - Give backups meaningful names (e.g., "Production Release v1.0", "GR02-Bug Fixes")
  - **Lock Backups** - Protect important backups from automatic deletion
    - Locked backups are never deleted, even when exceeding 5 backup limit
    - When 6th backup is created, oldest *unlocked* backup is deleted
    - Visual indicator (🔒) shows locked status
  - **Manual Delete** - Remove specific backups you no longer need
    - Confirmation dialog prevents accidental deletion
    - Removes both backup folder and metadata
  
- **Smart Conflict Detection** - Context-aware messaging
  - Detects if YOU modified the file vs a teammate
  - Different messages for each scenario:
    - **Teammate modified:** "⚠️ WARNING: Conflict Detected!"
    - **You modified:** "⚠️ WARNING: Your local file is outdated!"
  - Different action buttons:
    - **Teammate conflict:** "🔍 Resolve Conflict"
    - **Your changes:** "🔎 Review Changes"
  - Shows who made the last modification
 
### Enhanced
- **Backup Picker UI** - Improved QuickPick interface
  - Four action buttons per backup (Rename, Lock/Unlock, Compare, Delete)
  - Time-ago display (e.g., "2 hours ago", "3 days ago")
  - Lock status indicator (🔒)
  - Custom names displayed prominently
  
- **User Experience** - Better messaging throughout
  - Context-aware conflict warnings
  - Clearer button labels
  - Validation on backup rename (prevents empty names, max 100 chars)
  - Confirmation dialogs for destructive actions
 
### Commands
- `SF Guard: Take Backup` - Create instant backup without deploying
- Backup management accessible via "SF Guard: Compare with Backup"
 
### Technical Improvements
- Service locator pattern for BackupService initialization
- Metadata storage tracks rename, lock status, and creation date
- Cleanup logic respects locked backups
- Separate conflict types: `'conflict'` vs `'overwrite'`
 
---

## [0.5.0] - 2026-03-15
 
### 🎉 Major Update - Automatic File Backups
 
### Added
- **Automatic File Backup System** - Never lose code to overwrites again
  - One-click enable/disable backup per file
  - Automatic backups created on every deployment
  - Up to 5 versions stored per file
  - Smart cleanup of old backups
  - Organized by org, metadata type, and file name
- **Compare with Backup** - Browse and restore previous versions
  - Visual backup history with timestamps
  - Side-by-side diff comparison
  - One-click restore functionality
  - Works with all supported file types
- **Backup Preferences Storage** - Per-workspace backup settings
  - Remember which files have backups enabled
  - Org-scoped backup management
  - Simple toggle on/off
 
### Performance
- **faster username lookups** with cached ConfigAggregator
  - Reuses ConfigAggregator instance across calls
  - Smart cache invalidation on org changes
  - Reduces repeated disk I/O operations
- **Optimized backup folder structure** using aliases instead of usernames
  - Cleaner, more readable folder names
  - Example: `.sfguard-backup/Dev/` instead of `.sfguard-backup/dev@company.com/`
 
### Commands
- `SF Guard: Enable/Disable Backup for This File` - Toggle automatic backups
- `SF Guard: Compare with Backup` - View and restore from backup history
 
### Technical Improvements
- Enhanced `salesforceService.ts` with `cachedAggregator` for better performance
- Added `getCachedAlias()` and `getCurrentAlias()` methods
- Implemented smart username caching with alias comparison
- Bundle file filtering for LWC and Aura (excludes hidden files, node_modules)
- Recursive folder deletion for old backup cleanup
 
### Backup Structure
```
.sfguard-backup/
├── {org-alias}/
│   └── {MetadataType}/
│       └── {ComponentName}/
│           └── {timestamp}/
│               ├── {file}.{ext}
│               └── {file}-meta.xml
```

## [0.4.1] - 2026-03-05

### Fixed
- Connection cache now properly refreshes when switching between Salesforce orgs
- Connection cache invalidates when org alias changes (e.g., changing "Dev" alias to different username)
- Temporary comparison files are now automatically cleaned up after use, preventing disk space buildup
- Retrieve timestamps are now org-scoped to prevent conflicts when working with multiple orgs

## [0.4.0] - 2026-02-18

### Added
- Aura component support (.cmp, .app, .evt, .intf, etc.)
- Visualforce page support (.page)
- Visualforce component support (.component)
- LWC .xml files in multi-file diff

## [0.3.2] - 2026-02-12

### Fixed
- Critical: Extension now properly resolves org aliases (e.g., "Dev") to actual usernames
- Fixed NamedOrgNotFound error when using org aliases in target-org config

## [0.3.1] - 2026-02-12

### Improvements
- Faster performance across all operations
- Enhanced security and reliability
- Improved code architecture for future features
- Minor bug fixes and optimizations

## [0.3.0] - 2026-02-07

### Added
- SOQL injection protection for all database queries
- Connection pooling (30-minute cache) for improved performance
- LWC multi-file diff checker - now handles bundles with multiple files of same type
- Sync Status Viewer - view all tracked files and their sync timestamps

### Changed
- Moved "Merge Manually" button to first position for better UX
- Removed redundant "Deployment successful" message (already shown by SF Extension Pack)

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