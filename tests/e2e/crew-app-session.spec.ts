import { createHash, createHmac } from 'node:crypto'

import { expect, test, type APIRequestContext } from '@playwright/test'

const applicationPath = '/api/application'
const browserApplicationPath = '/apps/vibe-helper/api/application'
const proxySecret = 'test-proxy-secret-with-at-least-thirty-two-bytes'
const projectId = 'project_10000000-0000-4000-8000-000000000001'
const correlationId = 'corr_10000000-0000-4000-8000-000000000001'

async function executeUi(request: APIRequestContext, input: Readonly<Record<string, unknown>>) {
  const body = JSON.stringify(input)
  const timestamp = Math.floor(Date.now() / 1_000).toString()
  const hash = createHash('sha256').update(body).digest('hex')
  const signature = createHmac('sha256', proxySecret)
    .update(`${timestamp}:POST:${applicationPath}:${hash}`)
    .digest('hex')
  return request.post(`http://127.0.0.1:4174${applicationPath}`, {
    headers: {
      'content-type': 'application/json',
      'x-kirocrew-proxy': `${timestamp}:${signature}`,
    },
    data: body,
  })
}

test('restores Project History, route state, and Crew conversations across reloads', async ({
  page,
  request,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  let releaseHistory: (() => void) | undefined
  const historyGate = new Promise<void>((resolve) => {
    releaseHistory = resolve
  })
  let delayed = false
  await page.route(`**${browserApplicationPath}`, async (route) => {
    if (!delayed) {
      delayed = true
      await historyGate
    }
    await route.continue()
  })
  await page.goto('/#/history', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('status')).toContainText('Opening Project History')
  releaseHistory?.()
  await expect(
    page.getByRole('heading', { name: 'Your project history starts here.' }),
  ).toBeVisible()
  await page.unroute(`**${browserApplicationPath}`)

  const created = await executeUi(request, {
    schemaVersion: 1,
    kind: 'UI_START_DISCOVERY',
    correlationId,
    actor: { kind: 'UI' },
    idempotencyKey: 'idem_10000000-0000-4000-8000-000000000001',
    projectId,
    input: {
      learningGoal: 'Understand TypeScript runtime validation',
      personalNeed: 'I need safer configuration parsing for a small tool.',
      recentFriction: 'Static types did not reject malformed JSON at runtime.',
      currentLevel: 'BEGINNER',
    },
  })
  expect(created.ok()).toBe(true)
  expect(await created.json()).toMatchObject({ success: true })

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Pick up where you left off.' })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Understand TypeScript runtime validation/ }),
  ).toBeVisible()

  await page.evaluate(
    ({ project }) => {
      localStorage.setItem(
        'vibe-helper.test.slots',
        JSON.stringify([
          {
            key: `vibe-helper-builder-${project}`,
            messages: [
              { role: 'user', content: 'token=synthetic-browser-secret' },
              { role: 'assistant', content: 'I will keep the parser strict.' },
            ],
          },
          {
            key: `vibe-helper-helper-${project}`,
            messages: [{ role: 'assistant', content: 'Runtime validation checks unknown input.' }],
          },
        ]),
      )
    },
    { project: projectId },
  )

  await page.getByRole('button', { name: /Understand TypeScript runtime validation/ }).click()
  await expect(page).toHaveURL(new RegExp(`#/discovery\\?project=${projectId}$`))
  await expect(
    page.getByRole('heading', { name: 'Understand TypeScript runtime validation' }),
  ).toBeVisible()
  await expect(page.getByText('I need safer configuration parsing for a small tool.')).toBeVisible()

  await page.getByRole('link', { name: 'Build', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Build has not started.' })).toBeVisible()
  await expect(page.getByText('token=[REDACTED]')).toBeVisible()
  await expect(page.getByText('Runtime validation checks unknown input.')).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(new RegExp(`#/build\\?project=${projectId}$`))
  await expect(page.getByText('I will keep the parser strict.')).toBeVisible()

  await page.evaluate(() => localStorage.setItem('vibe-helper.test.crew-disconnected', 'true'))
  await page.reload()
  await expect(page.getByText('Crew conversation unavailable.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Build has not started.' })).toBeVisible()
  await page.evaluate(() => localStorage.removeItem('vibe-helper.test.crew-disconnected'))

  await page.route(`**${browserApplicationPath}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: {
          schemaVersion: 1,
          kind: 'OPERATION_ERROR',
          category: 'PERMISSION',
          code: 'WORKSPACE_PERMISSION_REQUIRED',
          disposition: 'USER_ACTION_REQUIRED',
          message: 'Grant access to the generated workspace.',
          correlationId,
          issues: [],
          redactionStatus: 'VERIFIED_REDACTED',
        },
      }),
    })
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Permission required' })).toBeVisible()
  await expect(page.getByText('Grant access to the generated workspace.')).toBeVisible()
  await page.unroute(`**${browserApplicationPath}`)

  await page.route(`**${browserApplicationPath}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { unexpected: true } }),
    })
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'This view could not be restored' })).toBeVisible()
  await page.unroute(`**${browserApplicationPath}`)

  await page.route(`**${browserApplicationPath}`, async (route) => route.abort())
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Core disconnected' })).toBeVisible()

  expect(pageErrors).toEqual([])
})
