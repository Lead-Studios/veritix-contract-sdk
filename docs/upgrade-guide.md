# VeriTix SDK Upgrade Guide

This guide documents breaking changes and migration steps between SDK versions.

---

## Table of Contents

- [Upgrading from 0.1.x → 0.2.x](#upgrading-from-01x--02x)
- [Upgrading from 0.2.x → 0.3.x](#upgrading-from-02x--03x)
- [Deprecation Policy](#deprecation-policy)

---

## Upgrading from 0.1.x → 0.2.x

### Breaking Changes

1. **RevenueSplitParams Deprecated**
   - Old (0.1.x):
     ```ts
     await client.split.createRevenueSplit({
       organizer: 'G...',
       organizerBps: 5000,
       artist: 'G...',
       artistBps: 3000,
       platform: 'G...',
       totalAmount: 1000000n,
     });
     ```
   - New (0.2.x): Use `SplitRecipient[]` with `CreateSplitParams`
     ```ts
     await client.split.createSplit({
       recipients: [
         { address: 'G...', shareBps: 5000 },
         { address: 'G...', shareBps: 3000 },
         { address: 'G...', shareBps: 2000 },
       ],
       totalAmount: 1000000n,
     });
     ```

2. **NetworkConfig.retries Changed**
   - Changed from `connectionRetries` to `retries`
   - Changed from `connectionRetryDelayMs` to `retryDelayMs`

### Migration Checklist

- [ ] Update all `RevenueSplitParams` calls to use `SplitRecipient[]`
- [ ] Rename `connectionRetries` → `retries` in NetworkConfig
- [ ] Rename `connectionRetryDelayMs` → `retryDelayMs` in NetworkConfig
- [ ] Run `npm test` to verify changes compile

---

## Upgrading from 0.2.x → 0.3.x

### Breaking Changes

1. **VeriTixClient Constructor**
   - Network config parameter is now required
   - Removed default testnet config fallback

---

## Deprecation Policy

SDK versions follow [Semantic Versioning](https://semver.org/):
- **Major (0.x)**: Breaking changes, may require code migration
- **Minor (x.1)**: New features, backward compatible
- **Patch (x.x.1)**: Bug fixes, backward compatible

Deprecated APIs are announced 2 versions in advance before removal. Check `CHANGELOG.md` for details.
