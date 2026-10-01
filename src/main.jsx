import { createRoot } from 'react-dom/client';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource-variable/jetbrains-mono';
import './index.css';
import './lib/theme.js';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js');
