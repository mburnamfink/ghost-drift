import { Game } from './game';
import './style.css';

const params = new URLSearchParams(location.search);
const seed = params.has('seed') ? Number(params.get('seed')) : null;

new Game(document.querySelector<HTMLElement>('#app')!, Number.isFinite(seed) ? seed : null).start();
