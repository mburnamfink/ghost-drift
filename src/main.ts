import { Game, type GameOptions } from './game';
import { isLayoutName } from './sim/city';
import { startPadDebug } from './ui/padDebug';
import './style.css';

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) : null;
const wave = Math.max(1, Math.floor(Number(params.get('wave') ?? 1)) || 1);
const debug = new Set(params.getAll('debug').flatMap((d) => d.split(',')));
const app = document.querySelector<HTMLElement>('#app')!;

const map = params.get('map') ?? '';
const options: GameOptions = { overhead: debug.has('overhead'), firstWave: wave };
if (seed !== null && Number.isFinite(seed)) options.seed = seed;
if (isLayoutName(map)) options.layout = map;

new Game(app, options).start();
if (debug.has('pad')) startPadDebug(app);
