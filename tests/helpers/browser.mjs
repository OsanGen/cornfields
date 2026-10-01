import {createMaze} from '../../src/maze.js';
import {createGameApp} from '../../src/app.js';
import {installDebugHooks} from '../../src/debug.js';
import {createWeather} from '../../src/weather.js';

export function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    dispatch(type, values = {}) {
      const event = {target: {}, preventDefault() {}, ...values};
      for (const handler of listeners.get(type) || []) handler(event);
    },
    listenerCount() {
      return [...listeners.values()].reduce((sum, entries) => sum + entries.size, 0);
    },
  };
}

/** Fakes only browser/renderer/audio boundaries, never the game or runtime. */
export function createHarness({denyLock = false, lockRequest, audioUnlock, touch = false, width = 844, height = 390, weather = false, intro=false, prologue=false, ready=null, survival=false,corridors=false} = {}) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, {
      ...eventTarget(),
      hidden: false,
      textContent: '',
      style: {setProperty() {}},
      focus() {},
      getBoundingClientRect: () => ({left: 0, top: 0, width: 124, height: 124}),
    });
    return nodes.get(id);
  };
  const document = {
    ...eventTarget(),
    getElementById: node,
    body: {classList: {toggle() {}}},
    pointerLockElement: null,
    hidden: false,
    visibilityState: 'visible',
    hasFocus: () => true,
    exitPointerLock() {
      this.pointerLockElement = null;
      this.dispatch('pointerlockchange');
    },
  };
  node('scene').requestPointerLock = () => {
    if (denyLock) throw new Error('Denied');
    document.pointerLockElement = node('scene');
    return lockRequest?.() || Promise.resolve();
  };
  const window = eventTarget();
  Object.assign(window, {innerWidth: width, innerHeight: height});
  let frameId = 0;
  const frames = new Map();
  const audio = {
    interruptionListeners:new Set(),
    onInterruption(listener){this.interruptionListeners.add(listener);return()=>this.interruptionListeners.delete(listener);},
    interrupt(){if(this.ctx)this.ctx.state='interrupted';for(const listener of this.interruptionListeners)listener();},
    ctx: null, ticks: 0, resets: 0, muted: false, volume: 0.55, events: [], weatherEvents: [],
    async unlock() {
      if (audioUnlock) await audioUnlock();
      this.ctx = {state: 'running'};
    },
    async prepare(){if(audioUnlock)await audioUnlock();this.ctx={state:'running'};},
    startIntro(){this.introStarts=(this.introStarts||0)+1;},
    stopIntro(){this.introStops=(this.introStops||0)+1;},
    introCue(id){(this.introCues||=[]).push(id);},
    startGameplay(){this.gameStarts=(this.gameStarts||0)+1;},
    pause() { if (this.ctx) this.ctx.state = 'suspended'; },
    event(event) { this.events.push(event.type); },
    weatherEvent(event) { this.weatherEvents.push({...event}); },
    update() { this.ticks++; },
    reset() { this.resets++; },
    setVolume(value) { this.volume = value; },
    toggleMute() { return this.muted = !this.muted; },
  };
  const view = {
    renderer: {info: {render: {calls: 0, triangles: 0}}},
    visuals: {}, render() {}, reset() {},disposals:0,dispose(){this.disposals++;},
  };
  const maze = createMaze({survival,corridors});
  const weatherModel = weather ? createWeather(maze, {touch}) : null;
  const prologueView={start(){},render(){},release(){},dispose(){}};
  const prologueAudio={sync(){},cue(){},pause(){},release(){},dispose(){}};
  const app = createGameApp({
    maze, view, audio, weather: weatherModel, document, window, touch, introEnabled:intro||prologue,prologueEnabled:prologue,prologueView,prologueAudio, ready, now: () => 0,
    requestFrame(callback) { frames.set(++frameId, callback); return frameId; },
    cancelFrame(id) { frames.delete(id); },
  });
  installDebugHooks(app, window, maze, new URLSearchParams('test=1'));
  return {
    app, maze, node, document, window, audio, view, weather: weatherModel,
    key: (code, values) => document.dispatch('keydown', {code, ...values}),
    release: code => document.dispatch('keyup', {code}),
    click: id => node(id).dispatch('click'),
    fire: () => node('scene').dispatch('mousedown', {button: 0}),
    frame(time) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(time);
    },
    frames,
    flush: () => new Promise(resolve => setImmediate(resolve)),
  };
}
