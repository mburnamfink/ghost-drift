import { Game } from './game';
import { startPadDebug } from './ui/padDebug';
import './style.css';

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) : null;
const wave = Math.max(1, Math.floor(Number(params.get('wave') ?? 1)) || 1);
const debug = new Set(params.getAll('debug').flatMap((d) => d.split(',')));
const app = document.querySelector<HTMLElement>('#app')!;

new Game(app, Number.isFinite(seed) ? seed : null, debug.has('overhead'), wave).start();
if (debug.has('pad')) startPadDebug(app);
