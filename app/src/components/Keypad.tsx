// Calculator keypad that slides up while an amount is being edited.

import { useLayoutEffect, useRef, type PointerEvent } from 'react';
import type { KeypadKey } from '../lib/state';
import { playClick, unlockAudio } from '../lib/sound';

const OPS: [KeypadKey, string, string][] = [
  ['+', 'Plus', '+'],
  ['-', 'Minus', '−'],
  ['*', 'Times', '×'],
  ['/', 'Divide', '÷'],
  ['=', 'Equals', '='],
];

const DIGITS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function Keypad({ open, onKey }: { open: boolean; onKey: (key: KeypadKey) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const pressedKey = useRef<KeypadKey | null>(null);

  // The page makes room for the keypad (and hides the tab bar) via body.keypad-open.
  useLayoutEffect(() => {
    if (!open) return;
    document.body.style.setProperty('--keypad-h', `${ref.current!.offsetHeight}px`);
    document.body.classList.add('keypad-open');
    return () => document.body.classList.remove('keypad-open');
  }, [open]);

  function press(key: KeypadKey) {
    playClick();
    onKey(key);
  }

  // Keys act on touch-down, without waiting for the finger to lift, so fast
  // two-thumb typing doesn't drop taps. Done waits for the click, so the tap
  // can't land on whatever is under the keypad as it slides away.
  const keyProps = (key: KeypadKey) => ({
    type: 'button' as const,
    onPointerDown(e: PointerEvent<HTMLButtonElement>) {
      if (e.button > 0) return;
      e.preventDefault();
      e.currentTarget.classList.add('pressed');
      if (key === 'done') return;
      pressedKey.current = key;
      press(key);
    },
    onPointerUp: unpress,
    onPointerCancel: unpress,
    onPointerOut: unpress,
    onClick() {
      // Already handled on pointerdown; keyboard and VoiceOver presses only click.
      if (pressedKey.current === key) {
        pressedKey.current = null;
        return;
      }
      press(key);
    },
  });

  return (
    <div
      className="keypad"
      id="keypad"
      ref={ref}
      aria-hidden={!open}
      onClickCapture={unlockAudio}
      onTouchEndCapture={unlockAudio}
    >
      <div className="keypad-ops">
        {OPS.map(([key, label, text]) => <button key={key} {...keyProps(key)} aria-label={label}>{text}</button>)}
        <button {...keyProps('done')} className="done">Done</button>
      </div>
      <div className="keypad-keys">
        {DIGITS.map((d) => <button key={d} {...keyProps(d)}>{d}</button>)}
        <button {...keyProps('.')} className="flat">.</button>
        <button {...keyProps('0')}>0</button>
        <button {...keyProps('back')} className="flat" aria-label="Delete">
          <svg viewBox="0 0 24 24" width="26" height="26">
            <path d="M9 5h11v14H9l-6-7z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" fill="none" />
            <path d="M12 9l5 6m0-6l-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function unpress(e: PointerEvent<HTMLButtonElement>) {
  e.currentTarget.classList.remove('pressed');
}
