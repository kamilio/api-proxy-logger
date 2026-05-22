import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
    resolveViewerLogPath,
    deleteViewerLog,
    parseCompareLogSelection,
    buildCompareData,
} from '../src/services/viewer-service.js';

describe('resolveViewerLogPath', () => {
    it('returns null for path traversal attempts with ../', () => {
        assert.strictEqual(resolveViewerLogPath('/logs', '..', 'test.yaml'), null);
        assert.strictEqual(resolveViewerLogPath('/logs', '../etc', 'passwd.yaml'), null);
    });

    it('returns null for invalid provider segments', () => {
        assert.strictEqual(resolveViewerLogPath('/logs', 'provider/sub', 'test.yaml'), null);
        assert.strictEqual(resolveViewerLogPath('/logs', '.', 'test.yaml'), null);
        assert.strictEqual(resolveViewerLogPath('/logs', '..', 'test.yaml'), null);
    });

    it('returns null for invalid filename segments', () => {
        assert.strictEqual(resolveViewerLogPath('/logs', 'openai', '../test.yaml'), null);
        assert.strictEqual(resolveViewerLogPath('/logs', 'openai', '..'), null);
    });

    it('returns valid path for nested log filenames', () => {
        assert.strictEqual(
            resolveViewerLogPath('/logs', 'openai', 'model/hash.yaml'),
            '/logs/openai/model/hash.yaml'
        );
    });

    it('returns null for non-yaml files', () => {
        assert.strictEqual(resolveViewerLogPath('/logs', 'openai', 'test.json'), null);
        assert.strictEqual(resolveViewerLogPath('/logs', 'openai', 'test.txt'), null);
        assert.strictEqual(resolveViewerLogPath('/logs', 'openai', 'test'), null);
    });

    it('returns valid path for safe inputs', () => {
        const result = resolveViewerLogPath('/logs', 'openai', 'test.yaml');
        assert.strictEqual(result, '/logs/openai/test.yaml');
    });

    it('handles unknown provider correctly', () => {
        const result = resolveViewerLogPath('/logs', 'unknown', 'test.yaml');
        assert.strictEqual(result, '/logs/test.yaml');
    });

    it('allows valid filenames with dots and dashes', () => {
        const result = resolveViewerLogPath('/logs', 'anthropic', '2024-01-15_12-30-45.yaml');
        assert.strictEqual(result, '/logs/anthropic/2024-01-15_12-30-45.yaml');
    });
});

describe('deleteViewerLog', () => {
    let testDir;

    beforeEach(async () => {
        testDir = join(tmpdir(), `viewer-test-${Date.now()}`);
        await mkdir(testDir, { recursive: true });
        await mkdir(join(testDir, 'openai'), { recursive: true });
    });

    afterEach(async () => {
        await rm(testDir, { recursive: true, force: true });
    });

    it('returns invalid_path error for path traversal attempts', async () => {
        const result = await deleteViewerLog(testDir, '..', 'test.yaml');
        assert.deepStrictEqual(result, { success: false, error: 'invalid_path' });
    });

    it('returns invalid_path error for non-yaml files', async () => {
        const result = await deleteViewerLog(testDir, 'openai', 'test.json');
        assert.deepStrictEqual(result, { success: false, error: 'invalid_path' });
    });

    it('returns not_found error for non-existent files', async () => {
        const result = await deleteViewerLog(testDir, 'openai', 'nonexistent.yaml');
        assert.deepStrictEqual(result, { success: false, error: 'not_found' });
    });

    it('successfully deletes existing file', async () => {
        const filePath = join(testDir, 'openai', 'test.yaml');
        await writeFile(filePath, 'test: data');

        const result = await deleteViewerLog(testDir, 'openai', 'test.yaml');
        assert.deepStrictEqual(result, { success: true });

        const files = await readdir(join(testDir, 'openai'));
        assert.ok(!files.includes('test.yaml'));
    });

    it('handles unknown provider correctly', async () => {
        const filePath = join(testDir, 'test.yaml');
        await writeFile(filePath, 'test: data');

        const result = await deleteViewerLog(testDir, 'unknown', 'test.yaml');
        assert.deepStrictEqual(result, { success: true });

        const files = await readdir(testDir);
        assert.ok(!files.includes('test.yaml'));
    });
});

describe('parseCompareLogSelection', () => {
    it('parses provider and filename pairs and removes duplicates', () => {
        const result = parseCompareLogSelection('openai/a.yaml,openai/a.yaml,anthropic/b.yaml');
        assert.deepStrictEqual(result, {
            selections: [
                { provider: 'openai', filename: 'a.yaml' },
                { provider: 'anthropic', filename: 'b.yaml' },
            ],
            invalid: [],
        });
    });

    it('captures invalid entries and non-yaml files', () => {
        const result = parseCompareLogSelection('openai/a.txt,../bad.yaml,openai/a.yaml');
        assert.deepStrictEqual(result, {
            selections: [{ provider: 'openai', filename: 'a.yaml' }],
            invalid: ['openai/a.txt', '../bad.yaml'],
        });
    });

    it('flags extra selections beyond the max', () => {
        const result = parseCompareLogSelection(
            'openai/a.yaml,anthropic/b.yaml,azure/c.yaml,openai/d.yaml',
            { max: 3 }
        );
        assert.deepStrictEqual(result, {
            selections: [
                { provider: 'openai', filename: 'a.yaml' },
                { provider: 'anthropic', filename: 'b.yaml' },
                { provider: 'azure', filename: 'c.yaml' },
            ],
            invalid: ['openai/d.yaml'],
        });
    });
});

describe('buildCompareData', () => {
    it('builds diffs and detects identical sections', () => {
        const logs = [
            {
                request: {
                    headers: { Authorization: 'token-a' },
                    body: { prompt: 'Hello' },
                },
                response: {
                    headers: { 'content-type': 'application/json' },
                    body: { result: 'One' },
                    status: 200,
                },
            },
            {
                request: {
                    headers: { Authorization: 'token-b' },
                    body: { prompt: 'Hello' },
                },
                response: {
                    headers: { 'content-type': 'application/json' },
                    body: { result: 'Two' },
                    status: 200,
                },
            },
        ];

        const compareData = buildCompareData(logs, { baselineIndex: 1 });
        const requestHeaders = compareData.sections.find((section) => section.key === 'requestHeaders');
        const requestBody = compareData.sections.find((section) => section.key === 'requestBody');

        assert.strictEqual(compareData.baselineIndex, 1);
        assert.strictEqual(requestHeaders.allSame, false);
        assert.strictEqual(requestBody.allSame, true);
        assert.strictEqual(typeof requestHeaders.values[0], 'string');
        assert.ok(
            requestHeaders.diffs[0].some((part) => part.added || part.removed)
        );
        assert.ok(
            requestHeaders.diffs[1].every((part) => !part.added && !part.removed)
        );
    });
});
