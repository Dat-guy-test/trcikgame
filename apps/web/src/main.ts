import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { loadLang } from './lib/i18n.svelte';
import { settings } from './lib/settings.svelte';

// Load the chosen language first so the first paint is already translated.
await loadLang(settings.lang);
mount(App, { target: document.getElementById('app')! });
