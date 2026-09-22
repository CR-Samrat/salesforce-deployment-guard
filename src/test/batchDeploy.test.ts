import * as assert from 'assert';
import {
    createBatchResult,
    normalizeBatchSelections,
    orderBatchSelections,
    BatchDeploymentItem
} from '../utils/batchDeployment';

suite('Batch deployment helpers', () => {
    test('deduplicates files from the same LWC bundle', () => {
        const result = normalizeBatchSelections([
            '/project/force-app/main/default/lwc/myWidget/myWidget.html',
            '/project/force-app/main/default/lwc/myWidget/myWidget.js',
            '/project/force-app/main/default/classes/AccountService.cls'
        ]);

        assert.deepStrictEqual(
            result.map((item) => `${item.metadataInfo.type}:${item.metadataInfo.name}`),
            ['LightningComponentBundle:myWidget', 'ApexClass:AccountService']
        );
    });

    test('deduplicates files from the same Aura bundle', () => {
        const result = normalizeBatchSelections([
            '/project/force-app/main/default/aura/myComponent/myComponent.cmp',
            '/project/force-app/main/default/aura/myComponent/myComponentController.js'
        ]);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].metadataInfo.type, 'AuraDefinitionBundle');
        assert.strictEqual(result[0].metadataInfo.name, 'myComponent');
    });

    test('excludes unsupported files and package manifests', () => {
        const result = normalizeBatchSelections([
            '/project/force-app/main/default/classes/AccountService.cls',
            '/project/force-app/main/default/manifest/package.xml',
            '/project/notes/readme.txt'
        ]);

        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0].metadataInfo.name, 'AccountService');
    });

    test('maps deployment failures and details to a table result', () => {
        const item: BatchDeploymentItem = {
            filePath: '/project/classes/AccountService.cls',
            metadataInfo: { type: 'ApexClass', name: 'AccountService' }
        };

        const result = createBatchResult(item, {
            success: false,
            message: 'Deployment failed for AccountService.',
            details: ['AccountService.cls:12 - Compile error']
        });

        assert.deepStrictEqual(result, {
            filePath: '/project/classes/AccountService.cls',
            metadataType: 'ApexClass',
            componentName: 'AccountService',
            status: 'failed',
            message: 'Deployment failed for AccountService.',
            details: ['AccountService.cls:12 - Compile error']
        });
    });

    test('preserves the selected deployment order', () => {
        const availableItems: BatchDeploymentItem[] = [
            { filePath: '/project/classes/First.cls', metadataInfo: { type: 'ApexClass', name: 'First' } },
            { filePath: '/project/classes/Second.cls', metadataInfo: { type: 'ApexClass', name: 'Second' } },
            { filePath: '/project/classes/Third.cls', metadataInfo: { type: 'ApexClass', name: 'Third' } }
        ];

        const result = orderBatchSelections(availableItems, [
            '/project/classes/Third.cls',
            '/project/classes/First.cls'
        ]);

        assert.deepStrictEqual(result.map((item) => item.metadataInfo.name), ['Third', 'First']);
    });
});