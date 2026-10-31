// Settings tab: the "Send money" destinations, rate alerts, and setup-code backup.

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { destinationLabel, exportCode, newDestination, saveDestinations, TYPES, type Destination, type TemplateValues } from '../lib/send';
import { ActionTitle, useActionSheet } from './ActionSheet';
import { AlertsSetting } from './AlertsSetting';
import { DestinationEditor, type EditorMode } from './DestinationEditor';
import { Icon, ICONS, Plus } from './icons';
import { useToast } from './Toast';

interface Props {
  hidden: boolean;
  destinations: Destination[];
  onDestinations: (list: Destination[]) => void;
  sampleValues: TemplateValues;
  list: string[];
}

function summary(d: Destination): string {
  if (d.type === 'email') return d.to ? `Email · ${d.to}` : 'Email';
  if (d.type === 'shortcut') return `Shortcut · ${d.shortcut}`;
  const m = d.url.match(/^([a-z][a-z0-9+.-]*):\/*([^/?#]*)/i);
  if (!m) return 'Link';
  return /^https?$/i.test(m[1]) ? `Link · ${m[2]}` : `App link · ${m[1]}://`;
}

export function Settings({ hidden, destinations, onDestinations, sampleValues, list }: Props) {
  const actionSheet = useActionSheet();
  const toast = useToast();
  // Kept after closing so the sheet doesn't empty while it slides away; `id`
  // remounts the editor (fresh fields, scrolled to the top) on each open.
  const [editor, setEditor] = useState<{ mode: EditorMode; open: boolean; id: number } | null>(null);

  const openEditor = (mode: EditorMode) => setEditor((e) => ({ mode, open: true, id: (e?.id ?? 0) + 1 }));
  const closeEditor = () => setEditor((e) => e && { ...e, open: false });

  function commit(next: Destination[]) {
    saveDestinations(next);
    onDestinations(next);
  }

  function addDestination() {
    actionSheet({
      header: <ActionTitle title="Add destination" sub="What should Send money open?" />,
      items: Object.entries(TYPES).map(([type, t]) => ({
        label: t.label,
        icon: ICONS[t.icon],
        run: () => openEditor({ mode: 'dest', dest: newDestination(type as Destination['type']), isNew: true }),
      })),
    });
  }

  async function copyBackup() {
    if (!destinations.length) return toast('Nothing to back up yet');
    const code = exportCode(destinations);
    try {
      await navigator.clipboard.writeText(code);
      toast('Setup code copied');
    } catch {
      openEditor({ mode: 'show', code });
    }
  }

  return (
    <section className="view" data-view="settings" hidden={hidden}>
      <header className="topbar">
        <span className="round-btn placeholder" />
        <h1 className="page-title">Settings</h1>
        <span className="round-btn placeholder" />
      </header>
      <main className="scroller">
        <h2 className="section-title">Send money</h2>
        <p className="section-note">Where <b>Send money</b> takes you from a currency’s menu. It sends from your “You convert” currency. These are saved only on this device and are never part of the app’s code.</p>
        <ul className="dest-list" id="dest-list">
          {destinations.map((d) => (
            <li key={d.id}>
              <button type="button" className="dest-row" onClick={() => openEditor({ mode: 'dest', dest: { ...d }, isNew: false })}>
                <span className="dest-icon"><Icon d={ICONS[TYPES[d.type].icon]} /></span>
                <span className="row-text"><span className="code">{destinationLabel(d)}</span><span className="name">{summary(d)}</span></span>
                <svg className="chev-right" viewBox="0 0 24 24" width="18" height="18">
                  <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
        <p className="section-note empty-note" id="dest-empty" hidden={destinations.length > 0}>No destinations yet.</p>
        <button type="button" className="add-row" id="dest-add" onClick={addDestination}>
          <Plus size={22} strokeWidth={2.2} />
          Add destination
        </button>

        <h2 className="section-title">Rate alerts</h2>
        <p className="section-note">A notification when a currency in your list hits a 2-week high or low against your “You convert” currency. Rates are checked daily; alerts arrive between 8 am and 9 pm.</p>
        <AlertsSetting list={list} />

        <h2 className="section-title">Backup</h2>
        <p className="section-note">Copy a setup code to restore your destinations after reinstalling or on another device. Keep it private.</p>
        <div className="button-row">
          <button type="button" className="pill-btn secondary" id="backup-copy" onClick={copyBackup}>Copy setup code</button>
          <button type="button" className="pill-btn secondary" id="backup-restore" onClick={() => openEditor({ mode: 'restore' })}>Restore</button>
        </div>

        <h2 className="section-title">About</h2>
        <p className="section-note">Rates from <a href="https://github.com/fawazahmed0/exchange-api" target="_blank" rel="noopener">exchange-api</a> and <a href="https://frankfurter.dev" target="_blank" rel="noopener">Frankfurter</a> (ECB), updated daily. Flags from <a href="https://github.com/HatScripts/circle-flags" target="_blank" rel="noopener">circle-flags</a>.</p>
      </main>

      {/* Outside the view, which is display: none on other tabs. */}
      {editor && createPortal(
        <DestinationEditor
          key={editor.id}
          mode={editor.mode}
          open={editor.open}
          sampleValues={sampleValues}
          onClose={closeEditor}
          onSave={(dest) => {
            const exists = destinations.some((d) => d.id === dest.id);
            commit(exists ? destinations.map((d) => (d.id === dest.id ? dest : d)) : [...destinations, dest]);
          }}
          onDelete={(id) => commit(destinations.filter((d) => d.id !== id))}
          onRestore={(restored) => {
            commit(restored);
            toast(`Restored ${restored.length} destination${restored.length === 1 ? '' : 's'}`);
          }}
        />,
        document.body,
      )}
    </section>
  );
}
