# SF Guard

> Conflict-aware Salesforce source deployment, retrieval, and local backup protection for VS Code.

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-Marketplace-blue)](https://marketplace.visualstudio.com/items?itemName=SubhadeepDev.salesforce-deployment-guard)
[![Version](https://img.shields.io/badge/version-1.0.0-green)](https://marketplace.visualstudio.com/items?itemName=SubhadeepDev.salesforce-deployment-guard)
[![Source](https://img.shields.io/badge/source-GitHub-black)](https://github.com/CR-Samrat/salesforce-deployment-guard)

SF Guard helps Salesforce developers avoid accidental source overwrites. Before deployment, it checks whether the component changed in the org after the last known sync, presents a visual comparison when a conflict is found, and can retain local backup versions for recovery.

## Highlights

- Safe Deploy checks for potential org-side changes before deployment.
- Visual comparison helps you review local and org versions before proceeding.
- Native deploy and retrieve operations use Salesforce Source Deploy Retrieve (SDR); SF Guard does not depend on Salesforce Extension Pack command IDs.
- Backup history keeps up to five versions per component, with support for naming, locking, comparing, and deleting backups.
- The SF Guard Output channel shows deploy, retrieve, conflict, and error details automatically.

## Supported Workflows

| Metadata | Retrieve | Safe Deploy | Backup and Compare |
| --- | --- | --- | --- |
| Apex classes and metadata XML | Yes | Yes | Yes |
| Apex triggers and metadata XML | Yes | Yes | Yes |
| Visualforce pages and components | Yes | Yes | Yes |
| Lightning Web Component bundles | Yes | Yes | Yes |
| Aura component bundles | Yes | Yes | Yes |
| Package manifests in a `manifest` folder | Yes, retrieves listed members | Not available | Manual backup and compare |

SF Guard intentionally hides its context-menu actions for metadata types it does not yet support, such as Custom Object fields, layouts, FlexiPages, permission sets, and static resources.

## Installation

1. Open the Extensions view in VS Code.
2. Search for `Salesforce Deployment Guard`.
3. Select **Install**.

Requirements:

- Salesforce CLI installed and authenticated with a target org.
- A Salesforce DX project open in VS Code.

## Complete Usage Guide

### 1. Retrieve Source with Tracking

![Tracked Retrieve](./images/tracked-retrieve.gif)

Right-click a supported source file or LWC/Aura component folder and select **SF Guard: Retrieve from Org**. SF Guard retrieves the component and stores its sync baseline for future Safe Deploy checks.

### 2. Safe Deploy with Conflict Detection

![Safe Deploy](./images/safe-deploy.gif)

Right-click a supported source file or bundle folder and select **SF Guard: Safe Deploy to Org**. If SF Guard detects a possible org-side change, it opens a diff view so you can review the conflict before deciding how to proceed. A pending deployment can be cancelled from the progress notification.

### 3. Review the SF Guard Output Channel

SF Guard automatically activates its Output channel whenever an SF Guard command starts. It includes conflict decisions, deploy and retrieve summaries, the relevant component files, and detailed SDR errors when an operation fails.

### 4. Retrieve from a Package Manifest

Right-click an XML file inside your project's `manifest` folder and select **SF Guard: Retrieve Source in Manifest From Org**. SF Guard retrieves the members defined in that manifest into the project's default package directory, such as `force-app/main/default`.

You can also use **Keep Backup for This File** and **Compare with Backup** for manifest files when you want to retain different manifest versions.

### 5. Enable Automatic Backups

![Enable Backup](./images/enable-backup.gif)

Right-click a supported source file and select **SF Guard: Enable/Disable Backup for This File**. When enabled, each successful Safe Deploy creates a backup of the component before deployment.

SF Guard retains up to five backups for a component. If a sixth backup is created, the oldest unlocked backup is removed. Locked backups are never removed automatically.

### 6. Compare with a Backup

![Compare Backup](./images/compare-backup.gif)

Select **SF Guard: Compare with Backup** to choose a saved version. The VS Code diff editor opens the backup beside the current file so you can review or copy back the changes you need. Backups can be renamed, locked, unlocked, or deleted from the backup picker.

### 7. View Sync Status

![Sync Status](./images/sync-status.gif)

Run **SF Guard: View Sync Status** from the Command Palette to inspect tracked component sync times and remove entries that are no longer useful.

## Commands

| Command | Description |
| --- | --- |
| `SF Guard: Retrieve from Org` | Retrieve a supported component and record its sync baseline. |
| `SF Guard: Retrieve Source in Manifest From Org` | Retrieve the components listed in a package manifest. |
| `SF Guard: Safe Deploy to Org` | Check for conflicts, optionally create a backup, and deploy a supported component. |
| `SF Guard: Enable/Disable Backup for This File` | Toggle automatic pre-deployment backups for a supported component. |
| `SF Guard: Keep Backup for This File` | Create a backup without deploying. |
| `SF Guard: Compare with Backup` | Open a saved backup beside the current local file. |
| `SF Guard: View Sync Status` | Review or clear tracked component sync baselines. |

## How Conflict Detection Works

1. Retrieve a component with SF Guard, or deploy it successfully through SF Guard, to establish a local sync baseline.
2. Before a Safe Deploy, SF Guard checks the corresponding metadata in the target org.
3. For tracked components, SF Guard can also recognize newer Salesforce Extension Pack retrieve or deploy operations from local Salesforce history.
4. If the org version is newer than the known baseline, SF Guard asks you to review the difference before deployment.

Conflict detection is designed to reduce accidental overwrites, not replace normal team communication, pull requests, or source control.

## Backup Storage

Backups are stored locally in the workspace and grouped by org alias, metadata type, component name, and timestamp.

```text
.sfguard-backup/
  Dev/
    ApexClass/
      AccountController/
        2026-08-30T10-30-15-123Z/
          AccountController.cls
          AccountController.cls-meta.xml
```

## Troubleshooting

### No active Salesforce org

Confirm that the Salesforce CLI can see an authenticated org:

```bash
sf org list
```

Authenticate again if necessary:

```bash
sf org login web -a Dev
```

### A command is not visible in the right-click menu

SF Guard only displays commands for supported metadata. Confirm that you selected a supported source file, LWC/Aura bundle folder, or manifest XML file in a `manifest` folder.

### A deploy or retrieve fails

Open the `SF Guard` Output channel. It is activated automatically for each SF Guard command and contains the detailed Salesforce error information.

## Privacy and Security

- SF Guard uses your existing Salesforce CLI authentication; it does not require separate credentials.
- Sync state and backups are stored locally in your workspace or VS Code workspace state.
- SF Guard does not send source code or backups to an external SF Guard service.
- The source is available on [GitHub](https://github.com/CR-Samrat/salesforce-deployment-guard).

## Roadmap

Potential future improvements include batch deployment with conflict checks, richer deployment history, configurable backup retention, and support for additional Salesforce metadata types.

## Contributing and Support

- [Report an issue](https://github.com/CR-Samrat/salesforce-deployment-guard/issues)
- [Suggest an enhancement](https://github.com/CR-Samrat/salesforce-deployment-guard/issues/new)
- [View the source on GitHub](https://github.com/CR-Samrat/salesforce-deployment-guard)

## License

[MIT](LICENSE)
