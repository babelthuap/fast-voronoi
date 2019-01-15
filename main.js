import Canvas from './js/Canvas.js';
import FastVoronoi from './js/FastVoronoi.js';
import {extractUrlParams} from './js/util.js';

Promise.all([
  fetch('./lattice/sorted'),
  Promise.resolve(new Canvas()),
]).then(([response, canvas]) => {
  response.arrayBuffer().then(arrayBuffer => init(arrayBuffer, canvas));
});

function init(arrayBuffer, canvas) {
  const sortedLattice = new Int8Array(arrayBuffer);
  const voronoi = new FastVoronoi(canvas, sortedLattice);
  canvas.attachToDom();

  let handlingMousedown = false;
  canvas.addEventListener('mousedown', ({layerX, layerY}) => {
    if (handlingMousedown) {
      return;
    }
    handlingMousedown = true;
    voronoi.randomize().then(() => handlingMousedown = false);
  });

  let handlingKeypress = false;
  document.addEventListener('keydown', ({keyCode}) => {
    if (handlingKeypress) {
      return;
    }
    handlingKeypress = true;
    if (keyCode === 65 /* 'a' */) {
      voronoi.toggleAA();
    }
    if (keyCode === 67 /* 'c' */) {
      voronoi.recolor();
    }
    if (keyCode === 84 /* 't' */) {
      voronoi.toggleCapitols();
    }
    setTimeout(() => handlingKeypress = false, 0);
  });

  setTimeout(() => {
    if (!window.matchMedia('only screen and (max-width: 760px)').matches &&
        extractUrlParams()['controls'] !== 'false') {
      alert(`Controls:
      a = toggle antialiasing
      c = recolor
      t = toggle tile capitols
      click = re-randomize`);
    }
  }, 0);
}
