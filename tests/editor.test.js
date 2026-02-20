import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getEditorCandidates } from '../src/editor.js';

describe('getEditorCandidates', () => {
  it('returns editor and platform fallback when EDITOR is set', () => {
    const candidates = getEditorCandidates({
      env: { EDITOR: 'vim' },
      platform: 'darwin',
    });
    assert.deepStrictEqual(candidates, [
      { command: 'vim', shell: true },
      { command: 'open', shell: false },
    ]);
  });

  it('returns platform fallback when EDITOR is not set', () => {
    const candidates = getEditorCandidates({
      env: {},
      platform: 'linux',
    });
    assert.deepStrictEqual(candidates, [
      { command: 'xdg-open', shell: false },
    ]);
  });

  it('returns empty list when no editor or fallback is available', () => {
    const candidates = getEditorCandidates({
      env: {},
      platform: 'win32',
    });
    assert.deepStrictEqual(candidates, []);
  });

  it('uses config editor as first candidate', () => {
    const candidates = getEditorCandidates({
      env: { EDITOR: 'vim' },
      platform: 'darwin',
      editor: 'code',
    });
    assert.deepStrictEqual(candidates, [
      { command: 'code', shell: true },
      { command: 'vim', shell: true },
      { command: 'open', shell: false },
    ]);
  });

  it('uses config editor even when no EDITOR env or platform fallback', () => {
    const candidates = getEditorCandidates({
      env: {},
      platform: 'win32',
      editor: 'notepad++',
    });
    assert.deepStrictEqual(candidates, [
      { command: 'notepad++', shell: true },
    ]);
  });
});
