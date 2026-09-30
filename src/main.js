import {createMaze} from './maze.js';
import {createScene} from './scene.js';
import {FieldAudio} from './audio.js';
import {createGameApp} from './app.js';
import {installDebugHooks} from './debug.js';

const node = id => document.getElementById(id);
node('start-btn').disabled = true;

try {
  const parameters = new URLSearchParams(location.search);
  const touch = parameters.get('controls') === 'touch' ||
    (parameters.get('controls') !== 'mouse' && matchMedia('(pointer: coarse)').matches);
  document.body.classList.toggle('touch', touch);
  node('rotate').hidden = !touch || innerWidth >= innerHeight;
  const maze = createMaze();
  const view = createScene(node('scene'), maze, {touch});
  const audio = new FieldAudio();
  await view.ready;

  const app = createGameApp({
    maze, view, audio, document, window, touch,
    debug: parameters.has('debug'),
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  installDebugHooks(app, window, maze, parameters);
  app.startLoop();
} catch (error) {
  node('error').hidden = false;
  node('error-copy').textContent = error.message + '. Try a browser with WebGL enabled.';
  console.error(error);
}
