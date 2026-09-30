/** Stable verification hooks, using the same runtime as real input. */
export function installDebugHooks(app, window, maze, parameters) {
  window.render_game_to_text = () => JSON.stringify(app.snapshot());
  window.advanceTime = milliseconds => app.advance(milliseconds);
  if (parameters.has('test')) {
    window.__test = {
      diagnostics: app.diagnostics,
      state: app.snapshot,
      maze: () => maze.grid,
      anchors: () => structuredClone(maze.hideAnchors),
      route: app.route,
      step: app.step,
    };
  }
}
