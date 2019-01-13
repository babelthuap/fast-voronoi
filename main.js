import Canvas from './js/Canvas.js';
import FastVoronoi from './js/FastVoronoi.js';
import {extractUrlParams} from './js/util.js';

// TIMING
let start = performance.now();

const canvas = new Canvas();
const urlParams = extractUrlParams();
const getNumTiles = () => {
  return parseInt(urlParams['n']) ||
      Math.round(window.innerWidth * window.innerHeight / 3000);
};

fetch('./lattice/sorted')
    .then(response => response.arrayBuffer())
    .then(init);

function init(arrayBuffer) {
  const sortedLattice = new Int8Array(arrayBuffer);
  const numTiles = getNumTiles();
  const voronoi = new FastVoronoi({canvas, numTiles, sortedLattice});
  canvas.attachToDom();
  console.log(`initial render: ${(performance.now() - start).toFixed(1)} ms`);

  canvas.addEventListener('mousedown', ({layerX, layerY}) => {
    start = performance.now();
    voronoi.rerender(getNumTiles());
    console.log(`rerender: ${(performance.now() - start).toFixed(1)} ms`);
  });
}
