import { useEffect, useRef, type RefObject } from 'react'

// Shared overlay behaviour for Dialog / Sheet: when open, trap Tab focus inside
// the container, close on Escape, and restore focus to the element that opened
// it on unmount. Keeps the two overlays' accessibility identical.

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  // Hold onClose in a ref so the effect depends only on `open` — otherwise a
  // caller passing an inline arrow would give onClose a new identity every
  // render, re-running the effect and yanking focus back to the first element
  // mid-interaction (e.g. on every keystroke in a controlled dialog input).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const container = ref.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    // Move focus into the overlay (first focusable, else the container itself).
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    const first = focusables()[0]
    ;(first ?? container).focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [ref, open])
}
