import { expect, test } from '@playwright/test'

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

test('mobile-width login shell does not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')

  await expect(page.getByRole('button', { name: 'マジックリンクを送る' })).toBeVisible()
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(horizontalOverflow).toBeLessThanOrEqual(1)
})
