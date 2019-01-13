import Canvas from './js/Canvas.js';
import FastVoronoi from './js/FastVoronoi.js';
import {extractUrlParams} from './js/util.js';

const start = performance.now();

const urlParams = extractUrlParams();
const getNumTiles = () => {
  return parseInt(urlParams['n']) ||
      Math.round(window.innerWidth * window.innerHeight / 3000);
};

Promise.all([
  fetch('./lattice/sorted'),
  Promise.resolve(new Canvas()),
]).then(([response, canvas]) => {
  response.arrayBuffer().then(arrayBuffer => init(arrayBuffer, canvas));
});

function init(arrayBuffer, canvas) {
  const sortedLattice = new Int8Array(arrayBuffer);
  const numTiles = getNumTiles();
  const voronoi = new FastVoronoi({canvas, numTiles, sortedLattice});
  canvas.attachToDom();
  console.log(`initial render: ${(performance.now() - start).toFixed(1)} ms`);

  canvas.addEventListener('mousedown', ({layerX, layerY}) => {
    const start_ = performance.now();
    voronoi.randomize(getNumTiles());
    console.log(`rerender: ${(performance.now() - start_).toFixed(1)} ms`);
  });

  document.addEventListener('keydown', ({keyCode}) => {
    if (keyCode === 65 /* 'a' */) {
      const start_ = performance.now();
      voronoi.toggleAA();
      console.log(`toggle AA: ${(performance.now() - start_).toFixed(1)} ms`);
    }
    if (keyCode === 67 /* 'c' */) {
      const start_ = performance.now();
      voronoi.recolor();
      console.log(`recolor: ${(performance.now() - start_).toFixed(1)} ms`);
    }
    if (keyCode === 84 /* 't' */) {
      const start_ = performance.now();
      voronoi.toggleCapitols();
      console.log(`toggle capitols: ${(performance.now() - start_).toFixed(1)} ms`);
    }
  });
}
