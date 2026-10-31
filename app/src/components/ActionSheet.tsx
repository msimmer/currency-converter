// iOS-style action sheet, shown from anywhere with useActionSheet().

import { createContext, use, useCallback, useState, type ReactNode } from 'react';
import { cx, Icon } from './icons';
import { useModal } from './useModal';

export interface ActionItem {
  label: string;
  icon?: string;
  danger?: boolean;
  run: () => void;
}

export interface ActionSheetOptions {
  header?: ReactNode;
  items: ActionItem[];
}

const ActionSheetContext = createContext<(opts: ActionSheetOptions) => void>(() => {});

export const useActionSheet = () => use(ActionSheetContext);

export function ActionSheetProvider({ children }: { children: ReactNode }) {
  // Kept after closing, so the sheet doesn't empty while it slides away.
  const [sheet, setSheet] = useState<ActionSheetOptions | null>(null);
  const [open, setOpen] = useState(false);
  const modal = useModal(open);

  const show = useCallback((opts: ActionSheetOptions) => {
    setSheet(opts);
    setOpen(true);
  }, []);
  const close = () => setOpen(false);

  return (
    <ActionSheetContext value={show}>
      {children}
      <div className={cx('backdrop', modal.open && 'open')} id="actions-backdrop" hidden={modal.hidden} onClick={close} />
      <div className={cx('action-sheet', modal.open && 'open')} id="actions" role="dialog" aria-modal="true" hidden={modal.hidden}>
        <div className="action-group">
          {sheet?.header}
          {sheet?.items.map((item, i) => (
            <button
              key={i}
              type="button"
              className={cx('action', item.danger && 'danger')}
              onClick={() => {
                // An item may open another action sheet; it replaces this one.
                close();
                item.run();
              }}
            >
              {item.icon && <Icon d={item.icon} />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <div className="action-group">
          <button type="button" className="action cancel" onClick={close}>Cancel</button>
        </div>
      </div>
    </ActionSheetContext>
  );
}

/** The title block at the top of an action sheet. */
export function ActionTitle({ badge, title, sub }: { badge?: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="action-title">
      {badge}
      <div>
        <div className="code">{title}</div>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </div>
  );
}
