//  ./../utils/metadataUtils
import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
    getMetadataInfo,
    fetchRetrieveableFiles,
    getFileExtensionsForType,
} from './../utils/metadataUtils';

// ---------------------------------------------------------------------------
// getMetadataInfo
// ---------------------------------------------------------------------------

suite('getMetadataInfo', () => {

    // ── Apex Class ──────────────────────────────────────────────────────────
    suite('Apex Class', () => {
        test('returns ApexClass for .cls file', () => {
            const result = getMetadataInfo('/force-app/main/default/classes/MyClass.cls');
            assert.deepStrictEqual(result, { type: 'ApexClass', name: 'MyClass' });
        });

        test('returns ApexClass for .cls-meta.xml file', () => {
            const result = getMetadataInfo('/force-app/main/default/classes/MyClass.cls-meta.xml');
            assert.deepStrictEqual(result, { type: 'ApexClass', name: 'MyClass' });
        });

        test('handles Windows-style path separator for .cls-meta.xml', () => {
            const result = getMetadataInfo('C:\\project\\classes\\AccountHelper.cls-meta.xml');
            assert.deepStrictEqual(result, { type: 'ApexClass', name: 'AccountHelper' });
        });
    });

    // ── Apex Trigger ────────────────────────────────────────────────────────
    suite('Apex Trigger', () => {
        test('returns ApexTrigger for .trigger file', () => {
            const result = getMetadataInfo('/force-app/main/default/triggers/AccountTrigger.trigger');
            assert.deepStrictEqual(result, { type: 'ApexTrigger', name: 'AccountTrigger' });
        });

        test('returns ApexTrigger for .trigger-meta.xml file', () => {
            const result = getMetadataInfo('/force-app/main/default/triggers/AccountTrigger.trigger-meta.xml');
            assert.deepStrictEqual(result, { type: 'ApexTrigger', name: 'AccountTrigger' });
        });
    });

    // ── Visualforce Page ────────────────────────────────────────────────────
    suite('Visualforce Page', () => {
        test('returns ApexPage for .page file', () => {
            const result = getMetadataInfo('/force-app/main/default/pages/MyPage.page');
            assert.deepStrictEqual(result, { type: 'ApexPage', name: 'MyPage' });
        });

        test('returns ApexPage for .apex file', () => {
            const result = getMetadataInfo('/force-app/main/default/pages/MyPage.apex');
            assert.deepStrictEqual(result, { type: 'ApexPage', name: 'MyPage' });
        });

        test('returns ApexPage for .page-meta.xml file', () => {
            const result = getMetadataInfo('/force-app/main/default/pages/MyPage.page-meta.xml');
            assert.deepStrictEqual(result, { type: 'ApexPage', name: 'MyPage' });
        });
    });

    // ── Visualforce Component ───────────────────────────────────────────────
    suite('Visualforce Component', () => {
        test('returns ApexComponent for .component file', () => {
            const result = getMetadataInfo('/force-app/main/default/components/MyComp.component');
            assert.deepStrictEqual(result, { type: 'ApexComponent', name: 'MyComp' });
        });

        test('returns ApexComponent for .component-meta.xml file', () => {
            const result = getMetadataInfo('/force-app/main/default/components/MyComp.component-meta.xml');
            assert.deepStrictEqual(result, { type: 'ApexComponent', name: 'MyComp' });
        });
    });

    // ── LWC ─────────────────────────────────────────────────────────────────
    suite('Lightning Web Component', () => {
        test('detects LWC from .html file inside lwc folder', () => {
            const result = getMetadataInfo('/force-app/main/default/lwc/myComponent/myComponent.html');
            assert.deepStrictEqual(result, { type: 'LightningComponentBundle', name: 'myComponent' });
        });

        test('detects LWC from .js file inside lwc folder', () => {
            const result = getMetadataInfo('/force-app/main/default/lwc/myComponent/myComponent.js');
            assert.deepStrictEqual(result, { type: 'LightningComponentBundle', name: 'myComponent' });
        });

        test('detects LWC from .css file inside lwc folder', () => {
            const result = getMetadataInfo('/force-app/main/default/lwc/myComponent/myComponent.css');
            assert.deepStrictEqual(result, { type: 'LightningComponentBundle', name: 'myComponent' });
        });

        test('detects LWC from .xml meta file inside lwc folder', () => {
            const result = getMetadataInfo('/force-app/main/default/lwc/myComponent/myComponent.js-meta.xml');
            assert.deepStrictEqual(result, { type: 'LightningComponentBundle', name: 'myComponent' });
        });

        test('detects LWC with Windows-style path separator', () => {
            const result = getMetadataInfo('C:\\project\\lwc\\myWidget\\myWidget.html');
            assert.deepStrictEqual(result, { type: 'LightningComponentBundle', name: 'myWidget' });
        });

        test('returns null for .html file NOT inside lwc folder', () => {
            const result = getMetadataInfo('/force-app/main/default/staticresources/index.html');
            assert.strictEqual(result, null);
        });
    });

    // ── Aura ─────────────────────────────────────────────────────────────────
    suite('Aura Component', () => {
        test('detects Aura from .cmp file', () => {
            const result = getMetadataInfo('/force-app/main/default/aura/myAuraComp/myAuraComp.cmp');
            assert.deepStrictEqual(result, { type: 'AuraDefinitionBundle', name: 'myAuraComp' });
        });

        test('detects Aura from .app file', () => {
            const result = getMetadataInfo('/force-app/main/default/aura/myApp/myApp.app');
            assert.deepStrictEqual(result, { type: 'AuraDefinitionBundle', name: 'myApp' });
        });

        test('detects Aura from .evt file', () => {
            const result = getMetadataInfo('/force-app/main/default/aura/myEvent/myEvent.evt');
            assert.deepStrictEqual(result, { type: 'AuraDefinitionBundle', name: 'myEvent' });
        });

        test('detects Aura from .js file inside aura folder', () => {
            const result = getMetadataInfo('/force-app/main/default/aura/myAuraComp/myAuraCompController.js');
            assert.deepStrictEqual(result, { type: 'AuraDefinitionBundle', name: 'myAuraComp' });
        });

        test('detects Aura with Windows-style path separator', () => {
            const result = getMetadataInfo('C:\\project\\aura\\myAuraComp\\myAuraComp.cmp');
            assert.deepStrictEqual(result, { type: 'AuraDefinitionBundle', name: 'myAuraComp' });
        });
    });

    // ── Unsupported / null ────────────────────────────────────────────────
    suite('Unsupported files', () => {
        test('returns null for .txt file', () => {
            assert.strictEqual(getMetadataInfo('/some/path/notes.txt'), null);
        });

        test('returns null for .json file', () => {
            assert.strictEqual(getMetadataInfo('/some/path/config.json'), null);
        });

        test('returns null for an XML file not in any known metadata folder', () => {
            // XML but no recognised folder in path → handleXmlMetadata returns null
            assert.strictEqual(getMetadataInfo('/some/random/folder/file.xml'), null);
        });

        test('returns null for empty string path', () => {
            assert.strictEqual(getMetadataInfo(''), null);
        });
    });
});

// ---------------------------------------------------------------------------
// fetchRetrieveableFiles
// ---------------------------------------------------------------------------

suite('fetchRetrieveableFiles', () => {

    test('returns two files for ApexClass', () => {
        const info = { type: 'ApexClass', name: 'MyClass' };
        const result = fetchRetrieveableFiles(info, '');
        assert.deepStrictEqual(result, ['MyClass.cls', 'MyClass.cls-meta.xml']);
    });

    test('returns two files for ApexTrigger', () => {
        const info = { type: 'ApexTrigger', name: 'AccountTrigger' };
        const result = fetchRetrieveableFiles(info, '');
        assert.deepStrictEqual(result, ['AccountTrigger.trigger', 'AccountTrigger.trigger-meta.xml']);
    });

    test('returns two files for ApexPage', () => {
        const info = { type: 'ApexPage', name: 'MyPage' };
        const result = fetchRetrieveableFiles(info, '');
        assert.deepStrictEqual(result, ['MyPage.page', 'MyPage.page-meta.xml']);
    });

    test('returns two files for ApexComponent', () => {
        const info = { type: 'ApexComponent', name: 'MyComp' };
        const result = fetchRetrieveableFiles(info, '');
        assert.deepStrictEqual(result, ['MyComp.component', 'MyComp.component-meta.xml']);
    });

    test('returns empty array for null metadataInfo', () => {
        // The function signature takes MetadataInfo but guards against falsy at runtime
        const result = fetchRetrieveableFiles(null as any, '');
        assert.deepStrictEqual(result, []);
    });

    test('returns empty array for unknown metadata type', () => {
        const info = { type: 'CustomObject', name: 'Account' };
        const result = fetchRetrieveableFiles(info, '');
        assert.deepStrictEqual(result, []);
    });

    // ── LWC bundle (uses real fs) ──────────────────────────────────────────
    suite('LightningComponentBundle — reads real directory', () => {
        let tmpDir: string;

        setup(() => {
            // Create a temp LWC bundle directory with realistic files
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lwc-test-'));
            ['myComp.html', 'myComp.js', 'myComp.css', 'myComp.js-meta.xml'].forEach(f =>
                fs.writeFileSync(path.join(tmpDir, f), '')
            );
            // Hidden file and node_modules should be excluded
            fs.writeFileSync(path.join(tmpDir, '.DS_Store'), '');
            fs.mkdirSync(path.join(tmpDir, 'node_modules'));
        });

        teardown(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        test('returns only allowed LWC extensions, excluding hidden files and node_modules', () => {
            const filePath = path.join(tmpDir, 'myComp.html');
            const info = { type: 'LightningComponentBundle', name: 'myComp' };
            const result = fetchRetrieveableFiles(info, filePath);

            assert.ok(result.includes('myComp.html'), 'should include .html');
            assert.ok(result.includes('myComp.js'), 'should include .js');
            assert.ok(result.includes('myComp.css'), 'should include .css');
            assert.ok(result.includes('myComp.js-meta.xml'), 'should include .xml');
            assert.ok(!result.includes('.DS_Store'), 'should exclude .DS_Store');
            assert.ok(!result.includes('node_modules'), 'should exclude node_modules');
        });
    });

    // ── Aura bundle (uses real fs) ─────────────────────────────────────────
    suite('AuraDefinitionBundle — reads real directory', () => {
        let tmpDir: string;

        setup(() => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-test-'));
            ['myAura.cmp', 'myAuraController.js', 'myAura.css', 'myAura.design'].forEach(f =>
                fs.writeFileSync(path.join(tmpDir, f), '')
            );
            fs.writeFileSync(path.join(tmpDir, '.gitkeep'), '');
        });

        teardown(() => {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        });

        test('returns allowed Aura extensions, excluding hidden files', () => {
            const filePath = path.join(tmpDir, 'myAura.cmp');
            const info = { type: 'AuraDefinitionBundle', name: 'myAura' };
            const result = fetchRetrieveableFiles(info, filePath);

            assert.ok(result.includes('myAura.cmp'), 'should include .cmp');
            assert.ok(result.includes('myAuraController.js'), 'should include .js');
            assert.ok(result.includes('myAura.css'), 'should include .css');
            assert.ok(result.includes('myAura.design'), 'should include .design');
            assert.ok(!result.includes('.gitkeep'), 'should exclude hidden files');
        });

        test('returns empty array when bundle directory does not exist', () => {
            const info = { type: 'AuraDefinitionBundle', name: 'ghost' };
            const result = fetchRetrieveableFiles(info, '/non/existent/path/ghost.cmp');
            assert.deepStrictEqual(result, []);
        });
    });
});

// ---------------------------------------------------------------------------
// getFileExtensionsForType
// ---------------------------------------------------------------------------

suite('getFileExtensionsForType', () => {

    test('returns LWC extensions for LightningComponentBundle', () => {
        const exts = getFileExtensionsForType('LightningComponentBundle');
        assert.deepStrictEqual(exts, ['.html', '.js', '.css', '.xml', '.svg']);
    });

    test('returns Aura extensions for AuraDefinitionBundle', () => {
        const exts = getFileExtensionsForType('AuraDefinitionBundle');
        assert.deepStrictEqual(exts, [
            '.cmp', '.app', '.evt', '.intf', '.auradoc',
            '.css', '.js', '.design', '.svg', '.tokens', '.xml'
        ]);
    });

    test('returns empty array for ApexClass (not a bundle type)', () => {
        assert.deepStrictEqual(getFileExtensionsForType('ApexClass'), []);
    });

    test('returns empty array for unknown type', () => {
        assert.deepStrictEqual(getFileExtensionsForType('SomethingRandom'), []);
    });

    test('returns empty array for empty string', () => {
        assert.deepStrictEqual(getFileExtensionsForType(''), []);
    });
});
