import { useEffect, useState } from 'react';

/**
 * Open/close transition for a sheet and its backdrop. Opening unhides them, then
 * adds `open` a frame later so the CSS transition runs; closing removes `open` and
 * hides them once the transition is done. Reopening mid-close cancels the hide.
 */
export function useModal(open: boolean): { hidden: boolean; open: boolean } {
  const [shown, setShown] = useState(false);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (open) {
      setShown(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setEntered(true)); });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setEntered(false);
    const timer = setTimeout(() => setShown(false), 280);
    return () => clearTimeout(timer);
  }, [open]);

  return { hidden: !shown, open: entered };
}
