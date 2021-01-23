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
  voronoi.randomize().then(() => {
    console.log(`first render: ${(performance.now()).toFixed(0)} ms`);
  });

  let imageUrl = null;
  let rendering = false;
  const render = () => {
    if (rendering) {
      return;
    }
    rendering = true;
    voronoi.randomize(imageUrl).then(() => rendering = false);
  };

  canvas.addEventListener('mousedown', render);

  document.getElementById('upload').addEventListener('change', function() {
    if (this.files && this.files[0]) {
      imageUrl = URL.createObjectURL(this.files[0]);
      render();
    }
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
        extractUrlParams()['controls'] === 'true') {
      alert(`Controls:
      a = toggle antialiasing
      c = recolor
      t = toggle tile capitols
      click = re-randomize`);
    }
  }, 0);
}
