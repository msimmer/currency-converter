import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ActionSheetProvider } from './components/ActionSheet';
import { ToastProvider } from './components/Toast';
import './app.css';

// Enables :active styles on iOS.
document.addEventListener('touchstart', () => {}, { passive: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <ActionSheetProvider>
        <App />
      </ActionSheetProvider>
    </ToastProvider>
  </StrictMode>,
);
