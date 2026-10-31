import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { hasOperator, isOp } from './lib/calc';
import { currencySubtitle, formatAmount, formatRate, plainAmount } from './lib/currencies';
import { formatDate } from './lib/dates';
import { cachedRates, fetchLatestRates, type LatestRates } from './lib/rates';
import { buildURL, destinationLabel, loadDestinations, openURL, problem, TYPES, type Destination, type TemplateValues } from './lib/send';
import {
  addCurrency, amountFor, amountIn, applyKey, loadState, moveCurrency, moveToTop, rate, rebase,
  removeCurrency, replaceCurrency, saveState, TABS, type Calc, type KeypadKey, type RangeKey, type Tab,
} from './lib/state';
import { ActionTitle, useActionSheet, type ActionItem } from './components/ActionSheet';
import { ChartView } from './components/ChartView';
import { Converter } from './components/Converter';
import { CurrencyPicker, type PickerRequest } from './components/CurrencyPicker';
import { Badge, cx, ICONS } from './components/icons';
import { Keypad } from './components/Keypad';
import { Settings } from './components/Settings';
import { useToast } from './components/Toast';

const STALE_AFTER_MS = 30 * 60 * 1000;

const TAB_BUTTONS: { tab: Tab; label: string; icon: ReactNode }[] = [
  {
    tab: 'converter',
    label: 'Convert',
    icon: <path d="M4 8h14l-4-4M20 16H6l4 4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  },
  {
    tab: 'charts',
    label: 'Chart',
    icon: <path d="M4 20V13M9.3 20V8M14.6 20v-6M20 20V5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />,
  },
  {
    tab: 'settings',
    label: 'Settings',
    icon: <>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2.2" fill="none" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </>,
  },
];

export function App() {
  const actionSheet = useActionSheet();
  const toast = useToast();

  const [rates, setRates] = useState<LatestRates | null>(cachedRates);
  const [state, setState] = useState(() => loadState(rates));
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [calc, setCalc] = useState<Calc | null>(null); // while the keypad is open
  const [picker, setPicker] = useState<{ request: PickerRequest; open: boolean; id: number } | null>(null);
  const [destinations, setDestinations] = useState(loadDestinations);

  useEffect(() => saveState(state), [state]);

  // ---- Rates ----

  const ratesRef = useRef(rates);
  const refreshingRef = useRef(false);

  const refreshRates = useCallback(async ({ force = false } = {}) => {
    if (refreshingRef.current) return;
    const current = ratesRef.current;
    if (!force && current && Date.now() - current.fetchedAt < STALE_AFTER_MS) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const next = await fetchLatestRates();
      ratesRef.current = next;
      setRates(next);
    } catch {
      setRefreshFailed(true);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshRates();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshRates(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshRates]);

  // ---- Calculator keypad ----

  function startCalc(code: string) {
    if (calc?.code === code) return;
    const committed = calc ? { ...state, amount: amountFor(calc.expr, state.amount) } : state;
    const next = rebase(committed, rates, code);
    setState(next);
    setCalc({ code, expr: plainAmount(next.amount, code), fresh: true });
  }

  function finishCalc() {
    if (!calc) return;
    setState((s) => ({ ...s, amount: amountFor(calc.expr, s.amount) }));
    setCalc(null);
  }

  function calcKey(key: KeypadKey | 'clear') {
    if (!calc) return;
    if (key === 'done') return finishCalc();
    const next = applyKey(calc, key);
    setCalc(next);
    setState((s) => ({ ...s, amount: amountFor(next.expr, s.amount) }));
  }

  // Hardware keyboard support (desktop, iPad keyboards).
  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (!calc || e.metaKey || e.ctrlKey) return;
    const map: Record<string, string> = { Enter: '=', Backspace: 'back', Escape: 'done', x: '*', X: '*', ',': '.' };
    const key = map[e.key] ?? e.key;
    if (/^[0-9.]$/.test(key) || isOp(key) || ['=', 'back', 'done'].includes(key)) {
      e.preventDefault();
      calcKey(key === '=' && !hasOperator(calc.expr) ? 'done' : key as KeypadKey);
    }
  });
  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // ---- The list ----

  function remove(code: string) {
    if (calc?.code === code) finishCalc();
    setState((s) => removeCurrency(s, rates, code));
  }

  function openPicker(request: PickerRequest) {
    if (!rates) return;
    setPicker((p) => ({ request, open: true, id: (p?.id ?? 0) + 1 }));
  }

  // ---- Row actions ----

  function openActions(code: string) {
    finishCalc();
    const hero = state.list[0];
    const other = code === hero ? state.list[1] : hero;
    const items: (ActionItem | false | undefined)[] = [
      code !== hero && { label: `Send ${hero} → ${code}`, icon: ICONS.send, run: () => sendMoney(code) },
      {
        label: 'Change currency',
        icon: ICONS.swap,
        run: () => openPicker({ mode: 'pick', current: code, onPick: (c) => setState((s) => replaceCurrency(s, rates, code, c)) }),
      },
      !!other && { label: `Chart ${code}/${other}`, icon: ICONS.chart, run: () => openChart(code, other) },
      code !== hero && { label: 'Make “You convert”', icon: ICONS.up, run: () => setState((s) => moveToTop(s, code)) },
      { label: 'Remove', icon: ICONS.trash, danger: true, run: () => remove(code) },
    ];
    actionSheet({
      header: <ActionTitle badge={<Badge code={code} />} title={code} sub={currencySubtitle(code)} />,
      items: items.filter((i) => !!i),
    });
  }

  // ---- Send money ----

  /** Token values for a send from the "You convert" currency to `to`. */
  function sendValues(to: string): TemplateValues {
    const from = state.list[0] ?? 'USD';
    return {
      amount: formatAmount(amountIn(state, rates, from), from),
      from,
      receive: formatAmount(amountIn(state, rates, to), to),
      to,
      rate: formatRate(rate(rates, from, to)),
      date: rates ? formatDate(rates.date) : '',
    };
  }

  function sendMoney(to: string) {
    if (!destinations.length) {
      switchTab('settings');
      toast('Add a destination for Send money');
      return;
    }
    const values = sendValues(to);
    const go = (d: Destination) => {
      const p = problem(d);
      if (p) toast(p);
      else openURL(buildURL(d, values));
    };
    if (destinations.length === 1) return go(destinations[0]);
    actionSheet({
      header: <ActionTitle title={`Send ${values.amount} ${values.from} → ${values.to}`} sub={`About ${values.receive} ${values.to}`} />,
      items: destinations.map((d) => ({ label: destinationLabel(d), icon: ICONS[TYPES[d.type].icon], run: () => go(d) })),
    });
  }

  // ---- Tabs and charts ----

  // The current tab is saved, so the app reopens where you left off.
  function switchTab(tab: Tab) {
    finishCalc();
    setState((s) => ({ ...s, tab: TABS.includes(tab) ? tab : 'converter' }));
  }

  function openChart(from: string, to: string) {
    setState((s) => ({ ...s, pair: [from, to] }));
    switchTab('charts');
  }

  const setRange = useCallback((range: RangeKey) => setState((s) => ({ ...s, range })), []);

  // ---- Rate alert taps ----

  // A tapped alert opens its chart: via #pair=CAD-USD on a fresh launch, or a
  // message from the service worker when the app is already running.
  const openPair = useEffectEvent((pair: unknown) => {
    const m = /^([A-Z]{3})-([A-Z]{3})$/.exec(typeof pair === 'string' ? pair : '');
    if (m) openChart(m[1], m[2]);
  });

  useEffect(() => {
    const pair = location.hash.match(/^#pair=(.*)$/)?.[1];
    if (pair) {
      history.replaceState(null, '', location.pathname + location.search);
      openPair(pair);
    }

    // Development serves no sw.js; `npm run preview` runs the real thing.
    if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('sw.js');
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-chart') openPair(e.data.pair);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  // ---- Render ----

  const setPair = (pair: [string, string]) => setState((s) => ({ ...s, pair }));

  return (
    <>
      <div className="app">
        <Converter
          hidden={state.tab !== 'converter'}
          state={state}
          rates={rates}
          calc={calc}
          editing={editing}
          refreshing={refreshing}
          refreshFailed={refreshFailed}
          onRefresh={() => refreshRates({ force: true })}
          onToggleEdit={() => {
            finishCalc();
            setEditing(!editing);
          }}
          onAdd={() => {
            finishCalc();
            openPicker({ mode: 'add' });
          }}
          onRemove={remove}
          onActions={openActions}
          onStartCalc={startCalc}
          onClear={() => calcKey('clear')}
          onFinishCalc={finishCalc}
          onMove={(from, to) => setState((s) => moveCurrency(s, from, to))}
        />
        <ChartView
          hidden={state.tab !== 'charts'}
          pair={state.pair}
          range={state.range}
          rates={rates}
          onPair={setPair}
          onRange={setRange}
          onPickCurrency={(idx) => openPicker({
            mode: 'pick',
            current: state.pair[idx],
            onPick: (code) => setState((s) => {
              const pair: [string, string] = [...s.pair];
              if (code === pair[1 - idx]) pair.reverse();
              else pair[idx] = code;
              return { ...s, pair };
            }),
          })}
        />
        <Settings
          hidden={state.tab !== 'settings'}
          destinations={destinations}
          onDestinations={setDestinations}
          sampleValues={sendValues(state.list[1] ?? (state.list[0] === 'EUR' ? 'USD' : 'EUR'))}
          list={state.list}
        />
        <nav className="dock">
          <div className="tabbar">
            {TAB_BUTTONS.map(({ tab, label, icon }) => (
              <button key={tab} className={cx('tab', state.tab === tab && 'active')} type="button" onClick={() => switchTab(tab)}>
                <svg viewBox="0 0 24 24" width="24" height="24">{icon}</svg>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      <Keypad open={!!calc} onKey={calcKey} />

      {picker && rates && (
        <CurrencyPicker
          key={picker.id}
          request={picker.request}
          open={picker.open}
          rates={rates.rates}
          list={state.list}
          onToggle={(code) => (state.list.includes(code) ? remove(code) : setState((s) => addCurrency(s, code)))}
          onClose={() => setPicker((p) => p && { ...p, open: false })}
        />
      )}
    </>
  );
}
