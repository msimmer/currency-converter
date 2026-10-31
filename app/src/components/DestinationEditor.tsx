// Sheet for editing a Send money destination, restoring a setup code, or showing one.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  buildURL, fill, importCode, newDestination, openURL, problem, TOKENS, TYPES,
  type Destination, type DestinationType, type TemplateValues,
} from '../lib/send';
import { ActionTitle, useActionSheet } from './ActionSheet';
import { cx, ICONS } from './icons';
import { useModal } from './useModal';

export type EditorMode =
  | { mode: 'dest'; dest: Destination; isNew: boolean }
  | { mode: 'restore' }
  | { mode: 'show'; code: string };

type TextField = HTMLInputElement | HTMLTextAreaElement;

const HINTS: Record<DestinationType, ReactNode> = {
  link: <>A web page, or an app link like <code>yourbank://</code> if your bank’s app supports one. Tokens are URL-encoded for you.</>,
  shortcut: <>Works with any app. In the Shortcuts app, create a shortcut with an <b>Open App</b> action for your banking app, then enter its name here exactly. The input text is passed to the shortcut, which can ignore it.</>,
  email: <>Separate multiple addresses with commas. Opens Mail with the message filled in; nothing is sent until you tap Send.</>,
};

const TITLES = { restore: 'Restore setup', show: 'Setup code' };
const SAVE_LABELS = { dest: 'Save', restore: 'Restore', show: 'Done' };

interface Props {
  mode: EditorMode;
  open: boolean;
  sampleValues: TemplateValues;
  onClose: () => void;
  onSave: (dest: Destination) => void;
  onDelete: (id: string) => void;
  onRestore: (list: Destination[]) => void;
}

// Show URLs readably in the preview (they're encoded when opened).
function decodeForDisplay(url: string): string {
  try { return decodeURIComponent(url); } catch { return url; }
}

export function DestinationEditor({ mode, open, sampleValues, onClose, onSave, onDelete, onRestore }: Props) {
  const actionSheet = useActionSheet();
  const modal = useModal(open);
  const [dest, setDest] = useState(mode.mode === 'dest' ? mode.dest : null);
  const [restoreCode, setRestoreCode] = useState('');
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const showCodeRef = useRef<HTMLTextAreaElement>(null);
  // The template field a token button inserts into: the last one focused.
  const lastField = useRef<TextField | null>(null);
  const caret = useRef<{ field: TextField; at: number } | null>(null);

  useEffect(() => {
    if (mode.mode === 'show') showCodeRef.current?.select();
  }, [mode.mode]);

  // After a token is inserted, put the cursor just after it.
  useLayoutEffect(() => {
    if (!caret.current) return;
    const { field, at } = caret.current;
    caret.current = null;
    field.focus();
    field.setSelectionRange(at, at);
  });

  function close() {
    (document.activeElement as HTMLElement | null)?.blur();
    onClose();
  }

  function update(key: string, value: string) {
    setDest((d) => d && ({ ...d, [key]: value } as Destination));
    setError('');
  }

  function insertToken(token: string) {
    const target = lastField.current ?? bodyRef.current?.querySelector<TextField>('[data-template]');
    if (!target?.dataset.key) return;
    const text = `{${token}}`;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    update(target.dataset.key, target.value.slice(0, start) + text + target.value.slice(end));
    caret.current = { field: target, at: start + text.length };
  }

  function save() {
    if (mode.mode === 'show') return close();
    if (mode.mode === 'restore') {
      try {
        onRestore(importCode(restoreCode));
        close();
      } catch (err) {
        setError((err as Error).message);
      }
      return;
    }
    const p = problem(dest!);
    if (p) return setError(p);
    onSave(dest!);
    close();
  }

  function field(
    key: string,
    label: string,
    { multiline = false, template = true, placeholder = '', inputMode = 'text' as 'text' | 'url' | 'email' } = {},
  ) {
    const props = {
      'data-key': key,
      'data-template': template ? '' : undefined,
      placeholder,
      autoComplete: 'off',
      autoCorrect: 'off',
      autoCapitalize: inputMode === 'text' ? 'sentences' : 'off',
      spellCheck: false,
      value: (dest as unknown as Record<string, string>)[key],
      onChange: (e: { target: TextField }) => update(key, e.target.value),
      onFocus: (e: { target: TextField }) => { if (template) lastField.current = e.target; },
    };
    return (
      <label className="field" key={key}>
        <span>{label}</span>
        {multiline ? <textarea rows={7} {...props} /> : <input type="text" inputMode={inputMode} {...props} />}
      </label>
    );
  }

  let title: string;
  let body: ReactNode;
  if (mode.mode === 'dest' && dest) {
    title = mode.isNew ? 'New destination' : 'Edit destination';
    const typeFields = {
      link: () => field('url', 'Link', { inputMode: 'url', placeholder: 'https://… or yourbank://' }),
      shortcut: () => <>
        {field('shortcut', 'Shortcut name', { template: false, placeholder: 'e.g. Open Bank' })}
        {field('input', 'Input text (optional)')}
      </>,
      email: () => <>
        {field('to', 'To', { template: false, inputMode: 'email', placeholder: 'name@example.com' })}
        {field('subject', 'Subject')}
        {field('body', 'Message', { multiline: true })}
      </>,
    }[dest.type];
    const preview = dest.type === 'email'
      ? `To: ${dest.to}\nSubject: ${fill(dest.subject, sampleValues)}\n\n${fill(dest.body, sampleValues)}`
      : decodeForDisplay(buildURL(dest, sampleValues));

    body = <>
      {field('name', 'Name', { template: false, placeholder: TYPES[dest.type].label })}
      <div className="segmented type-seg" role="tablist">
        {Object.entries(TYPES).map(([type, t]) => (
          <button
            key={type}
            type="button"
            className={cx(type === dest.type && 'active')}
            onClick={() => {
              if (type === dest.type) return;
              setDest({ ...newDestination(type as DestinationType), id: dest.id, name: dest.name });
              lastField.current = null;
              setError('');
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {typeFields()}
      <p className="hint">{HINTS[dest.type]}</p>
      <div className="tokens">
        <span className="tokens-label">Tap to insert</span>
        {TOKENS.map((t) => (
          <button key={t.token} type="button" className="token" title={t.label} onClick={() => insertToken(t.token)}>{`{${t.token}}`}</button>
        ))}
      </div>
      <div className="preview">
        <div className="preview-label">Preview</div>
        <pre id="preview">{preview}</pre>
      </div>
      <p className="form-error" id="form-error" hidden={!error}>{error}</p>
      <div className="form-actions">
        <button
          type="button"
          className="pill-btn secondary"
          id="editor-test"
          onClick={() => {
            const p = problem(dest);
            if (p) setError(p);
            else openURL(buildURL(dest, sampleValues));
          }}
        >
          Try it
        </button>
        {!mode.isNew && (
          <button
            type="button"
            className="pill-btn danger"
            id="editor-delete"
            onClick={() => actionSheet({
              header: <ActionTitle title="Delete this destination?" />,
              items: [{
                label: 'Delete',
                icon: ICONS.trash,
                danger: true,
                run: () => {
                  onDelete(dest.id);
                  close();
                },
              }],
            })}
          >
            Delete
          </button>
        )}
      </div>
    </>;
  } else if (mode.mode === 'restore') {
    title = TITLES.restore;
    body = <>
      <label className="field"><span>Setup code</span>
        <textarea
          rows={6}
          id="restore-code"
          placeholder="rates-setup:…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={restoreCode}
          onChange={(e) => setRestoreCode(e.target.value)}
        />
      </label>
      <p className="hint">Paste a code from <b>Copy setup code</b>. It replaces the destinations on this device.</p>
      <p className="form-error" id="form-error" hidden={!error}>{error}</p>
    </>;
  } else {
    title = TITLES.show;
    body = <>
      <label className="field"><span>Setup code</span>
        <textarea rows={6} readOnly id="show-code" ref={showCodeRef} value={mode.mode === 'show' ? mode.code : ''} />
      </label>
      <p className="hint">Copy this and keep it somewhere private, like your password manager. It contains your destinations.</p>
    </>;
  }

  return (
    <>
      <div className={cx('backdrop', modal.open && 'open')} id="editor-backdrop" hidden={modal.hidden} onClick={close} />
      <div className={cx('sheet', modal.open && 'open')} id="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title" hidden={modal.hidden}>
        <div className="sheet-grabber" />
        <header className="sheet-head">
          <button className="text-btn start" id="editor-cancel" type="button" hidden={mode.mode === 'show'} onClick={close}>Cancel</button>
          <h2 id="editor-title">{title}</h2>
          <button className="text-btn" id="editor-save" type="button" onClick={save}>{SAVE_LABELS[mode.mode]}</button>
        </header>
        <div className="sheet-body form" id="editor-body" ref={bodyRef}>{body}</div>
      </div>
    </>
  );
}
