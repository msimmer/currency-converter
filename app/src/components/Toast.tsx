import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react';
import { cx } from './icons';

const ToastContext = createContext<(message: string) => void>(() => {});

export const useToast = () => use(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((text: string) => {
    setMessage(text);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 2200);
  }, []);

  return (
    <ToastContext value={toast}>
      {children}
      <div className={cx('toast', show && 'show')} id="toast" role="status" aria-live="polite">{message}</div>
    </ToastContext>
  );
}
