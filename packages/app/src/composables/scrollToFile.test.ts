import { afterEach, describe, expect, it, vi } from 'vitest'
import { smoothScroll } from '../state/smooth-scroll'
import { scrollToFile } from './scrollToFile'

const fixtures: Array<{ settle: () => void }> = []

function mountMarker({ embedded = false, top = 500, margin = 24, containerTop = 160 } = {}) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = embedded ? host.attachShadow({ mode: 'open' }) : document
  const container = document.createElement('div')
  container.style.overflowY = 'auto'
  container.getBoundingClientRect = () => new DOMRect(0, containerTop, 400, 600)
  Object.defineProperties(container, {
    clientHeight: { value: 600 },
    scrollHeight: { value: 2000 },
  })
  if (embedded)
    root.append(container)

  const markers: Array<{ setTop: (value: number) => void }> = []
  function addMarker(sha: string, initialTop: number) {
    const marker = document.createElement('div')
    marker.dataset.fileStart = sha
    marker.style.scrollMarginTop = `${margin}px`
    let markerTop = initialTop
    marker.getBoundingClientRect = () => new DOMRect(0, markerTop, 400, 200)
    marker.scrollIntoView = vi.fn()
    if (embedded)
      container.append(marker)
    else
      host.append(marker)

    const target = {
      marker,
      setTop: (value: number) => { markerTop = value },
    }
    markers.push(target)
    return target
  }

  const { marker, setTop } = addMarker('abc', top)

  const fixture = {
    marker,
    root,
    container,
    setTop,
    addMarker,
    scrollEnd: () => (embedded ? container : document).dispatchEvent(new Event('scrollend')),
    settle: () => {
      markers.forEach(marker => marker.setTop(embedded ? containerTop + margin : margin))
      fixture.scrollEnd()
      // Also release listeners from the old window-only implementation after a red run.
      for (let i = 0; i < 7; i++)
        window.dispatchEvent(new Event('scrollend'))
    },
  }
  fixtures.push(fixture)
  return fixture
}

describe('scrollToFile', () => {
  afterEach(() => {
    fixtures.splice(0).forEach(fixture => fixture.settle())
    smoothScroll.value = true
    document.body.innerHTML = ''
  })

  it('animates the jump by default', () => {
    const { marker } = mountMarker()
    scrollToFile(document, 'abc')
    expect(marker.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('jumps right away with smooth scrolling turned off', () => {
    smoothScroll.value = false
    const { marker } = mountMarker()
    scrollToFile(document, 'abc')
    expect(marker.scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' })
  })

  it('does not jump when the document marker is already at its scroll margin', () => {
    const { marker } = mountMarker({ top: 24 })
    scrollToFile(document, 'abc')
    expect(marker.scrollIntoView).not.toHaveBeenCalled()
  })

  it('re-aims document scrolling as diffs grow, then stops once aligned', () => {
    const fixture = mountMarker()
    scrollToFile(document, 'abc')

    fixture.setTop(80)
    fixture.scrollEnd()
    expect(fixture.marker.scrollIntoView).toHaveBeenCalledTimes(2)

    fixture.setTop(24)
    fixture.scrollEnd()
    fixture.setTop(100)
    fixture.scrollEnd()
    expect(fixture.marker.scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('treats the embed scroll container top plus scroll margin as aligned', () => {
    const { root, marker } = mountMarker({ embedded: true, top: 184 })
    scrollToFile(root, 'abc')
    expect(marker.scrollIntoView).not.toHaveBeenCalled()
  })

  it('re-aims embed scrolling after non-composed scrollend events inside its ShadowRoot', () => {
    const fixture = mountMarker({ embedded: true })
    const outsideScrollEnd = vi.fn()
    window.addEventListener('scrollend', outsideScrollEnd, { capture: true })
    scrollToFile(fixture.root, 'abc')

    fixture.setTop(240)
    fixture.scrollEnd()
    window.removeEventListener('scrollend', outsideScrollEnd, { capture: true })

    expect(outsideScrollEnd).not.toHaveBeenCalled()
    expect(fixture.marker.scrollIntoView).toHaveBeenCalledTimes(2)
    expect(fixture.marker.scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('does not re-aim embed scrolling for a scrollend outside its ShadowRoot', () => {
    const fixture = mountMarker({ embedded: true })
    scrollToFile(fixture.root, 'abc')
    window.dispatchEvent(new Event('scrollend'))
    expect(fixture.marker.scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('stops listening when the embed marker settles at its container scroll margin', () => {
    const fixture = mountMarker({ embedded: true })
    scrollToFile(fixture.root, 'abc')
    fixture.scrollEnd()
    expect(fixture.marker.scrollIntoView).toHaveBeenCalledTimes(2)

    fixture.setTop(184)
    fixture.scrollEnd()
    fixture.setTop(400)
    fixture.scrollEnd()
    expect(fixture.marker.scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('bounds embed corrections when the target never settles', () => {
    const fixture = mountMarker({ embedded: true })
    scrollToFile(fixture.root, 'abc')
    for (let i = 0; i < 12; i++)
      fixture.scrollEnd()

    // One initial jump plus at most five corrections while lazy diffs keep growing.
    expect(fixture.marker.scrollIntoView).toHaveBeenCalledTimes(6)
  })

  it('keeps the latest file selected when a previous embed jump is still in flight', () => {
    const fixture = mountMarker({ embedded: true })
    const second = fixture.addMarker('def', 900)
    scrollToFile(fixture.root, 'abc')
    scrollToFile(fixture.root, 'def')

    fixture.setTop(-300)
    second.setTop(184)
    fixture.scrollEnd()

    expect(fixture.marker.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(second.marker.scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('replaces an earlier native embed animation even when the newly selected file is already aligned', () => {
    const fixture = mountMarker({ embedded: true })
    const second = fixture.addMarker('def', 184)
    scrollToFile(fixture.root, 'abc')

    fixture.setTop(-300)
    scrollToFile(fixture.root, 'def')
    fixture.scrollEnd()

    expect(fixture.marker.scrollIntoView).toHaveBeenCalledTimes(1)
    // A new native scroll command also stops the previous smooth animation.
    expect(second.marker.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(second.marker.scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'start' })

    second.setTop(400)
    fixture.scrollEnd()
    expect(second.marker.scrollIntoView).toHaveBeenCalledTimes(1)
  })
})
