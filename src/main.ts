import { Game } from './game';
import { startPadDebug } from './ui/padDebug';
import './style.css';

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) : null;
const app = document.querySelector<HTMLElement>('#app')!;

new Game(app, Number.isFinite(seed) ? seed : null).start();
if (params.get('debug') === 'pad') startPadDebug(app);
