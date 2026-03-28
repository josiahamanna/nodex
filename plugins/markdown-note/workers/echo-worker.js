/* Epic 2.3 smoke — bundled to dist/workers/echo-worker.bundle.js */
self.onmessage = function (e) {
  self.postMessage({ echo: e.data, t: Date.now() });
};
