// Stand-in for Chart.js, served instead of the real CDN file. The app calls
// Chart.register() at module scope and `new Chart(ctx, cfg)` per chart; this
// gives both enough surface to not throw, without a real render. Charts are
// never what these smoke tests assert on — the pure-logic suite in
// test/alfred-core.test.js and the throwaway render loop (alfred-verification
// skill) cover chart-adjacent behaviour when a change actually touches one.
(function (g) {
  function Chart(ctx, cfg) { this.ctx = ctx; this.config = cfg; this.canvas = ctx && ctx.canvas; }
  Chart.prototype.destroy = function () {};
  Chart.prototype.update = function () {};
  Chart.prototype.getElementsAtEventForMode = function () { return []; };
  Chart.register = function () {};
  Chart.defaults = { animation: {}, font: {}, plugins: { legend: {}, tooltip: {} } };
  g.Chart = Chart;
})(window);
