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

test('login maps magic-link email rate limits to Japanese copy', async ({ page }) => {
  await page.route('https://example.supabase.co/auth/v1/otp**', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        code: 'over_email_send_rate_limit',
        error_code: 'over_email_send_rate_limit',
        msg: 'email rate limit exceeded',
        message: 'email rate limit exceeded',
      }),
    })
  })

  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill('rate-limit@example.com')
  await page.getByRole('button', { name: 'マジックリンクを送る' }).click()
  await expect(page.getByText('メールの送信上限に達しました。標準では1時間に数通までです。受信箱の前のリンクがまだ使えることがあります。')).toBeVisible()
  await expect(page.getByLabel('メールアドレス')).toHaveValue('rate-limit@example.com')
})

test('login keeps the email and skips a second OTP send during cooldown', async ({ page }) => {
  let otpCalls = 0
  await page.route('https://example.supabase.co/auth/v1/otp**', async (route) => {
    otpCalls += 1
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Check your email for the magic link' }),
    })
  })

  await page.goto('/login')
  await page.getByLabel('メールアドレス').fill('already-sent@example.com')
  await page.getByRole('button', { name: 'マジックリンクを送る' }).click()
  await expect(page.getByText('メールをご確認ください。マジックリンクをお送りしました。')).toBeVisible()
  await expect(page.getByLabel('メールアドレス')).toHaveValue('already-sent@example.com')
  await expect(page.getByRole('button', { name: 'マジックリンクを送る' })).toBeDisabled()

  await page.locator('form').evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
  await expect(page.getByText('送信済みです。メールを確認してください。')).toBeVisible()
  expect(otpCalls).toBe(1)
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
    expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }),
    expect.objectContaining({ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }),
    expect.objectContaining({ src: '/icons/icon-512-maskable.png', purpose: 'maskable' }),
    expect.objectContaining({ src: '/icons/my-sns.svg' }),
    expect.objectContaining({ src: '/icons/my-sns-maskable.svg', purpose: 'maskable' }),
  ]))
})

test('PWA PNG icons are served as real files, not SVG placeholders', async ({ page, request }) => {
  const icon512 = await request.get('/icons/icon-512.png')
  expect(icon512.ok()).toBe(true)
  expect(icon512.headers()['content-type']).toMatch(/image\/png/)

  const appleIcon = await request.get('/apple-icon.png')
  expect(appleIcon.ok()).toBe(true)
  expect(appleIcon.headers()['content-type']).toMatch(/image\/png/)

  await page.goto('/login')
  const appleTouch = page.locator('link[rel="apple-touch-icon"]')
  await expect(appleTouch).toHaveCount(1)
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
