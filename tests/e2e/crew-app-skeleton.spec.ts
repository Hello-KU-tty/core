import { expect, test } from '@playwright/test'

test('renders the accessible Crew App skeleton without browser errors', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await page.goto('/')

  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Vibe Helper' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Repository skeleton is ready.')
  expect(pageErrors).toEqual([])
})
