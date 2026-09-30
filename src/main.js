import {createMaze} from './maze.js';
import {createScene} from './scene.js';
import {FieldAudio} from './audio.js';
import {createGameApp} from './app.js';
import {installDebugHooks} from './debug.js';
import {selectControlMode} from './control-mode.js';
import {createWeather} from './weather.js';
import {createIntroVisuals} from './intro-visuals.js';
import {INTRO_ENABLED} from './intro.js';

const node = id => document.getElementById(id);
node('start-btn').disabled = true;

try {
  const parameters = new URLSearchParams(location.search);
  const touch = selectControlMode({search:location.search,
    coarse:matchMedia('(pointer: coarse)').matches,
    fine:matchMedia('(pointer: fine)').matches,
    maxTouchPoints:navigator.maxTouchPoints})==='touch';
  document.body.classList.toggle('touch', touch);
  node('rotate').hidden = !touch || innerWidth >= innerHeight;
  const legacy=parameters.has('test')&&parameters.get('survival')==='off';
  const previous=parameters.has('test')&&parameters.get('layout')==='survival';
  const maze = createMaze({corridors:!legacy&&!previous,survival:previous});
  const weather = createWeather(maze, {touch, enabled: parameters.get('weather') !== 'off'});
  const view = createScene(node('scene'), maze, {touch, weather});
  const audio = new FieldAudio({weatherEnabled: weather.state.enabled});
  const introEnabled=INTRO_ENABLED&&parameters.get('intro')!=='off';
  const introView=introEnabled?createIntroVisuals(view.renderer,{getCorn:view.introCorn,touch,enhanced:parameters.get('introfx')!=='off'}):null;

  const app = createGameApp({
    maze, view, audio, weather, document, window, touch, introEnabled, introView, ready:view.ready,
    debug: parameters.has('debug'), horror:parameters.get('horror')!=='off',
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  installDebugHooks(app, window, maze, parameters);
  app.startLoop();
} catch (error) {
  node('error').hidden = false;
  node('error-copy').textContent = error.message + '. Try a browser with WebGL enabled.';
  console.error(error);
}
