# Chrome AI Memory

MV3 Chrome extension that **automatically learns** personal AI memory from Claude conversations, retrieves relevant memories via a **hybrid local store**, injects them into context, and shows exactly what Claude receives in a **compact side panel**.

Uses your existing **claude.ai** login in this Chrome profile — no new accounts.

**MVP scaffold** aligned with [`extension-framework.md`](https://github.com/janogelin/chromeaimemory) product defaults: on-device extraction, inject when pack changes, Chrome `sidePanel` for pack UI, DOM observe/inject on `claude.ai`, global scope, private unpacked load, stub embeddings with a swappable interface.

## Load unpacked

1. `npm install && npm run build`
2. Open `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → select the `dist/` folder (not the repo root)
4. Open [claude.ai](https://claude.ai) and sign in with your existing account
5. Click the extension icon → **Enable Auto-memory** (consent)
6. Open the pack panel from the popup (or page chip **Memory · N · Open**)

Rebuild after changes: `npm run build` (or `npm run watch`), then **Reload** the extension on `chrome://extensions`.

## Architecture map

```
src/
  background/service-worker.ts   # auth cache, consent, extract jobs, retrieve, pack, messaging
  content/claude.ts              # claude.ai CS: auth probe, observe, inject, page chip
  auth/                          # session-affinity signals (page UI only — no cookies)
  consent/                       # Auto-memory consent + Pause (chrome.storage.local)
  observe/claude/                # DOM turn/composer adapter (fragile selectors isolated)
  extract/                       # heuristic write/skip/merge (on-device)
  memory/store/                  # IndexedDB structured entries + vectors
  memory/vector/                 # Embedder interface + StubEmbedder + cosine
  memory/retrieve/               # hybrid filter → flat top-k → MemoryPack
  inject/claude/                 # visible composer prepend + page chip
  messaging/                     # typed SW ↔ CS ↔ UI protocol
  ui/popup/                      # Signed in · Auto-memory · Pause
  ui/sidepanel/                  # Pack view (“what Claude gets”) + thin manager
  ui/options/                    # privacy / consent / wipe
```

**Runtime loop**

1. Content script detects Claude signed-in UI → `AUTH_UPDATE`
2. With consent + not paused: observes new turns → `TURNS_OBSERVED` → local extract → IndexedDB
3. Context/composer changes → `CONTEXT_CHANGED` → embed query → hybrid retrieve → `MemoryPack`
4. When pack `entryIds` change → inject labeled block into composer + side panel lists the exact set

## Built vs stubbed

| Area | Status |
|------|--------|
| MV3 skeleton (SW, CS, popup, side panel, options) | **Working** |
| Consent + Pause gates | **Working** |
| Claude session-affinity auth probe | **Working** (heuristic DOM; no cookies) |
| IndexedDB entries + vector store | **Working** |
| Flat cosine top-k hybrid retrieve | **Working** |
| Pack side panel + exclude/disable | **Working** |
| Manual add / JSON import-export / wipe | **Working** |
| Heuristic extract (name/prefs/pnpm/role patterns) | **Working** (rules only) |
| Embeddings | **Stub** — `StubEmbedder` (`stub-hash-v1`, 64-d bag-of-hashes). Interface ready for WASM MiniLM / Transformers.js |
| Claude DOM observe selectors | **Best-effort stub** — real messaging wired; selectors will need patches as Claude UI churns |
| Composer inject on contenteditable | **Best-effort stub** — textarea path is solid; React contenteditable may need deeper adapter |
| Page chip | **Working** (simple fixed button) |

### Embeddings note

MVP ships the stub so `npm run build` stays dependency-light and offline. To upgrade later:

1. Implement `Embedder` in `src/memory/vector/` (e.g. Transformers.js / onnxruntime-web)
2. Call `setEmbedder(...)` from the service worker at startup
3. Bump `embeddingModelId` and re-embed entries
4. Prefer first-run cache (OPFS / extension storage) over shipping a huge model in the package unless size is acceptable

## Out of scope (intentionally)

Cloud sync, multi-host adapters, encryption at rest, API-key extraction, WASM HNSW, Anthropic OAuth.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | Bundle → `dist/` |
| `npm run watch` | Rebuild on change |
| `npm run typecheck` | `tsc --noEmit` |

## Privacy (MVP)

- Local-only by default; no analytics
- Consent required before observe / learn / inject
- Pause always available; wipe behind typed confirm
- Memories stored plaintext in IndexedDB in this profile
