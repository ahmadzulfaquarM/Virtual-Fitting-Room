import { describe, expect, it } from 'vitest'
import { SAMPLE_ASSETS, isSafeAssetOverride, resolveAssetUrls } from './sampleAssets'

describe('isSafeAssetOverride', () => {
  it.each(['/models/a.glb', '/x/y/z.GLB'])('accepts %s', (value) => {
    expect(isSafeAssetOverride(value)).toBe(true)
  })

  it.each([
    ['external URL', 'https://evil.example/a.glb'],
    ['protocol-relative', '//evil.example/a.glb'],
    ['path traversal', '/models/../secret.glb'],
    ['backslash', '/models\\a.glb'],
    ['wrong extension', '/models/a.gltf'],
    ['relative', 'models/a.glb'],
    ['empty', ''],
    ['null', null],
    ['too long', `/${'a'.repeat(300)}.glb`],
  ])('rejects %s', (_name, value) => {
    expect(isSafeAssetOverride(value)).toBe(false)
  })
})

describe('resolveAssetUrls', () => {
  it('defaults to the sample assets', () => {
    expect(resolveAssetUrls('')).toEqual({
      avatarUrl: SAMPLE_ASSETS.avatar.url,
      garmentUrl: SAMPLE_ASSETS.garment.url,
    })
  })

  it('accepts safe overrides and garment=none', () => {
    expect(resolveAssetUrls('?avatar=/models/missing.glb&garment=none')).toEqual({
      avatarUrl: '/models/missing.glb',
      garmentUrl: null,
    })
  })

  it('ignores unsafe overrides', () => {
    expect(resolveAssetUrls('?avatar=https://evil.example/a.glb&garment=//evil/b.glb')).toEqual({
      avatarUrl: SAMPLE_ASSETS.avatar.url,
      garmentUrl: SAMPLE_ASSETS.garment.url,
    })
  })
})
