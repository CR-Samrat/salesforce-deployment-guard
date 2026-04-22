//  ./../utils/sanitization.ts
import * as assert from 'assert';
import { sanitizeSOQL, sanitizeFileName } from './../utils/sanitization';

suite('sanitizeSOQL', () => {
    test('putting backslashes before single quotes in SOQL', () => {
        const result = sanitizeSOQL("it's a test's value");
        assert.strictEqual(result, "it\\'s a test\\'s value");
    });

    test("No single quotes, hence no change", () => {
        const result = sanitizeSOQL("its a test value");
        assert.strictEqual(result, "its a test value");
    });
});

suite('sanitizeFileName', () => {
    test('removing invalid characters from file name', () => {
        const result = sanitizeFileName("..\\invalid/filename<>:\"|?*");
        assert.strictEqual(result, "invalidfilename");
    });

    test('file name with no invalid characters should remain unchanged', () => {
        const result = sanitizeFileName("valid_filename.txt");
        assert.strictEqual(result, "valid_filename.txt");
    });
});