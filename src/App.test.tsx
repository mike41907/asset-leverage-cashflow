import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { deleteDatabase } from './data/database'

describe('app smoke mount', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(async () => {
    await act(async () => {
      root?.unmount()
    })
    container.remove()
    await deleteDatabase()
  })

  it('loads the local demo state and renders the dashboard', async () => {
    root = createRoot(container)
    await act(async () => {
      root.render(<App />)
    })
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 500))
    })

    expect(container.textContent).toContain('目前資產總覽')
    expect(container.textContent).toContain('00878')
    expect(container.textContent).toContain('本機模式')
  })
})
