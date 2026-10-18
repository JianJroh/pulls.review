import { scrollBehavior } from '../state/smooth-scroll'

const MAX_CORRECTIONS = 5
const TOLERANCE_PX = 2
const pendingScrolls = new WeakMap<EventTarget, () => void>()

/**
 * Scrolls (smoothly, unless turned off in Settings) to the non-sticky `[data-file-start]`
 * marker of a file (its own header is sticky, so its rect doesn't follow the file once
 * stuck). Diffs above the target keep growing while the scroll is in flight, so each
 * `scrollend` re-aims until the marker sits at its scroll-margin.
 */
export function scrollToFile(root: ParentNode, sha: string) {
  const marker = root.querySelector(`[data-file-start="${sha}"]`)
  if (!marker)
    return
  // The embed scrolls within its drawer, below the toolbar. On the site, the
  // document scrollport starts at the viewport top instead.
  let scroller = marker.parentElement
  while (scroller && scroller !== marker.ownerDocument.scrollingElement && !/auto|scroll|overlay/.test(getComputedStyle(scroller).overflowY))
    scroller = scroller.parentElement
  if (scroller === marker.ownerDocument.scrollingElement)
    scroller = null

  const scrollTarget = scroller ?? root
  const stopPrevious = pendingScrolls.get(scrollTarget)
  stopPrevious?.()
  const margin = Number.parseFloat(getComputedStyle(marker).scrollMarginTop)
  const isSettled = () => {
    const top = scroller ? scroller.getBoundingClientRect().top + scroller.clientTop : 0
    return Math.abs(marker!.getBoundingClientRect().top - top - margin) <= TOLERANCE_PX
  }

  let corrections = 0
  function stop() {
    scrollTarget.removeEventListener('scrollend', onScrollEnd, { capture: true })
    pendingScrolls.delete(scrollTarget)
  }
  function onScrollEnd() {
    if (isSettled() || corrections++ >= MAX_CORRECTIONS) {
      stop()
      return
    }
    marker!.scrollIntoView({ behavior: scrollBehavior.value, block: 'start' })
  }

  if (isSettled()) {
    // A new command also aborts the previous native smooth-scroll animation.
    if (stopPrevious)
      marker.scrollIntoView({ behavior: scrollBehavior.value, block: 'start' })
    return
  }
  pendingScrolls.set(scrollTarget, stop)
  scrollTarget.addEventListener('scrollend', onScrollEnd, { capture: true })
  marker.scrollIntoView({ behavior: scrollBehavior.value, block: 'start' })
}
