import { expect, test } from '@playwright/test'

test.beforeEach(async ({ context }) => {
  // These smoke tests deliberately prove the public/auth shell without relying
  // on Supabase or any SNS. Abort unexpected external requests so CI failures
  // cannot be caused by third-party availability or accidentally send data.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1:3100(?:\/|$))/, (route) => route.abort())
})

test('login renders My-SNS and validates an empty email locally', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'My-SNS', exact: true })).toBeVisible()
  await expect(page.getByLabel('メールアドレス')).toBeVisible()

  await page.getByRole('button', { name: 'マジックリンクを送る' }).click()
  await expect(page.getByText('メールアドレスを入力してください')).toBeVisible()
})

test('signed-out visitors are redirected away from protected app routes', async ({ page }) => {
  await page.goto('/app/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'My-SNS', exact: true })).toBeVisible()
})

test('PWA manifest is linked and launches into the publishing dashboard', async ({ page }) => {
  await page.goto('/login')

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBe('/manifest.webmanifest')

  const manifest = await page.evaluate(async () => {
    const response = await fetch('/manifest.webmanifest')
    if (!response.ok) throw new Error(`manifest request failed: ${response.status}`)
    return response.json() as Promise<Record<string, unknown>>
  })

  expect(manifest.name).toBe('My-SNS')
  expect(manifest.start_url).toBe('/app/dashboard')
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: '/icons/my-sns.svg' }),
    expect.objectContaining({ src: '/icons/my-sns-maskable.svg', purpose: 'maskable' }),
  ]))
})

test('security headers protect the app without disabling Web Share', async ({ page }) => {
  const response = await page.goto('/login')
  expect(response).not.toBeNull()

  const headers = response!.headers()
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['x-dns-prefetch-control']).toBe('off')
  expect(headers['x-permitted-cross-domain-policies']).toBe('none')

  const contentSecurityPolicy = headers['content-security-policy'] ?? ''
  expect(contentSecurityPolicy).toContain("base-uri 'self'")
  expect(contentSecurityPolicy).toContain("frame-ancestors 'none'")
  expect(contentSecurityPolicy).toContain("object-src 'none'")
  expect(contentSecurityPolicy).toContain("form-action 'self'")

  const permissionsPolicy = headers['permissions-policy'] ?? ''
  expect(permissionsPolicy).toContain('camera=()')
  expect(permissionsPolicy).toContain('microphone=()')
  expect(permissionsPolicy).toContain('geolocation=()')
  expect(permissionsPolicy).toContain('web-share=(self)')
  expect(permissionsPolicy).not.toContain('web-share=()')
})

test('mobile-width login shell does not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')

  await expect(page.getByRole('button', { name: 'マジックリンクを送る' })).toBeVisible()
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(horizontalOverflow).toBeLessThanOrEqual(1)
})
