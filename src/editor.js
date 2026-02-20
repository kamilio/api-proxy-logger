export function getEditorCandidates({ env = process.env, platform = process.platform, editor } = {}) {
  const candidates = [];
  if (editor) {
    candidates.push({ command: editor, shell: true });
  }
  if (env && env.EDITOR) {
    candidates.push({ command: env.EDITOR, shell: true });
  }
  if (platform === 'darwin') {
    candidates.push({ command: 'open', shell: false });
  }
  if (platform === 'linux') {
    candidates.push({ command: 'xdg-open', shell: false });
  }
  return candidates;
}
