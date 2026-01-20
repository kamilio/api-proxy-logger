# First Publish Checklist

## Available Package Names

All available on npm:
- **`llm-debugger`** (recommended)
- `llm-proxy-logger`
- `api-proxy-logger`
- `llm-request-logger`

---

## Setup Steps

### 1. Generate npm Access Token

- [ ] Go to https://www.npmjs.com → **Access Tokens**
- [ ] Click **Generate New Token** → **Granular Access Token**
- [ ] Name: `github-actions-llm-debugger`
- [ ] Expiration: No expiration (or your preference)
- [ ] Packages: **Read and write**
- [ ] Select: **Only select packages and scopes** → leave empty (for new package)
- [ ] Copy the token (starts with `npm_`)

### 2. Add Secret to GitHub Repository

- [ ] Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
- [ ] Click **New repository secret**
- [ ] Name: `NPM_TOKEN`
- [ ] Value: paste your npm token
- [ ] Click **Add secret**

### 3. Update package.json (if needed)

- [ ] Update `repository.url` to match your GitHub repo
- [ ] Update `bugs.url` to match your GitHub repo
- [ ] Update `homepage` to match your GitHub repo

### 4. Commit and Push

```bash
git add .
git commit -m "feat: initial release"
git push origin main
```

### 5. Verify Release

- [ ] Check GitHub Actions: https://github.com/YOUR_USER/YOUR_REPO/actions
- [ ] Check npm: https://www.npmjs.com/package/llm-debugger
- [ ] Check GitHub Releases: https://github.com/YOUR_USER/YOUR_REPO/releases

---

## How Releases Work

After setup, releases are **fully automated**:

1. Push to `main` branch
2. GitHub Actions runs tests
3. `semantic-release` analyzes commits
4. Version is bumped based on commit messages
5. Package is published to npm with provenance
6. GitHub Release is created

### Commit Message → Version

| Commit Prefix | Version Bump | Example |
|---------------|--------------|---------|
| `feat:` | Minor (0.1.0 → 0.2.0) | `feat: add response filtering` |
| `fix:` | Patch (0.1.0 → 0.1.1) | `fix: handle streaming errors` |
| `perf:` | Patch | `perf: reduce memory usage` |
| `refactor:` | Patch | `refactor: simplify proxy logic` |
| `BREAKING CHANGE:` | Major (0.1.0 → 1.0.0) | In commit body |

### No Release Triggered

These prefixes don't trigger a release:
- `chore:` - maintenance tasks
- `docs:` - documentation only
- `test:` - adding tests
- `ci:` - CI/CD changes

---

## Provenance

The package is published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements), which:
- Links the package to this GitHub repo
- Proves the package was built by GitHub Actions
- Shows a "Provenance" badge on npm

This is enabled via:
- `publishConfig.provenance: true` in package.json
- `id-token: write` permission in the workflow
- `provenance: true` in .releaserc.json
