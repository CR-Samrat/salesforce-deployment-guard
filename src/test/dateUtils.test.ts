//  ./../utils/dateUtils
import * as assert from 'assert';
import {getTimeAgo} from '../utils/dateUtils';

suite('getTimeAgo', () => {
    test("should return the correct time ago for <1 minute", () => {
        const result = getTimeAgo(new Date());
        assert.strictEqual(result, "Just now");
    });

    test("should return the correct time ago for <60 minutes", () => {
        const date = new Date();
        const result = getTimeAgo(new Date(date.getTime() - (5 * 60 * 1000))); // 5 minutes ago
        assert.strictEqual(result, "5 mins ago");
    });

    test("should return the correct time ago for >1 hour", () => {
        const date = new Date();
        const result = getTimeAgo(new Date(date.getTime() - (2 * 60 * 60 * 1000))); // 2 hours ago
        assert.strictEqual(result, "2 hours ago");
    });

    test("should return the correct time ago for >1 day", () => {
        const date = new Date();
        const result = getTimeAgo(new Date(date.getTime() - (2 * 24 * 60 * 60 * 1000))); // 2 days ago
        assert.strictEqual(result, "2 days ago");
    });

    test("should return the correct time ago for >1 month", () => {
        const date = new Date();
        const result = getTimeAgo(new Date(date.getTime() - (31 * 24 * 60 * 60 * 1000))); // 31 days ago
        assert.strictEqual(result, "1 month ago");
    });

    test("should return the correct time ago for >1 year", () => {
        const date = new Date();
        const result = getTimeAgo(new Date(date.getTime() - (370 * 24 * 60 * 60 * 1000))); // 370 days ago
        assert.strictEqual(result, "1 year ago");
    });
});
