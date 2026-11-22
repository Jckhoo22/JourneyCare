import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Bricolage Grotesque Variable — bundled, self-hosted, offline-safe. The
// variable file covers every weight the display face reaches for (500–700),
// so one @fontsource import replaces four static ones. [--font-display]
import '@fontsource-variable/bricolage-grotesque';
import './styles/tokens.css';
import './index.css';
import './styles/motion.css';
import { applyTheme } from './utils/theme';

// Before the first render, so the accent set is decided in the same frame the
// page paints — applying it after would flash the wrong colours. [Theme swap]
applyTheme();

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found in index.html');

const root = createRoot(container);

void import('./App').then(({ default: App }) => {
    root.render(
        <StrictMode>
            <App />
        </StrictMode>,
    );
}).catch((error: unknown) => {
    console.error('Journey Care startup failed:', error);
    root.render(
        <main role="alert" style={{ maxWidth: '40rem', margin: '4rem auto', padding: '0 1.25rem' }}>
            <h1>Journey Care couldn’t start</h1>
            <p>
                {import.meta.env.DEV && error instanceof Error
                    ? error.message
                    : 'Reload the page to try again.'}
            </p>
        </main>,
    );
});
