import {averageSubpixels, euclideanDist, extractUrlParams, pair, rand} from './util.js';

const NEIGHBOR_OFFSETS = [
           [0, -1],
  [-1, 0],          [1, 0],
           [0,  1],
];

const SUBPIXEL_OFFSETS = [
  [-1/3, -1/3], [0, -1/3], [1/3, -1/3],
  [-1/3,    0], [0,    0], [1/3,    0],
  [-1/3,  1/3], [0,  1/3], [1/3,  1/3],
];

let antialias = true;
let showCapitols = false;

let borderPixels;
let bordersKnown = false;

export default class FastVoronoi {
  constructor({canvas, numTiles, sortedLattice}) {
    this.canvas_ = canvas;
    this.sortedLattice_ = sortedLattice;
    this.randomize(numTiles);
  }

  randomize(numTiles) {
    const start = performance.now();
    this.tiles = placeCapitols({
      width: this.canvas_.width,
      height: this.canvas_.height,
      numTiles: numTiles,
    });
    this.pixels = partition({
      width: this.canvas_.width,
      height: this.canvas_.height,
      tiles: this.tiles,
      sortedLattice: this.sortedLattice_,
    });
    render({tiles: this.tiles, pixels: this.pixels, canvas: this.canvas_});
    console.log(`randomize: ${(performance.now() - start).toFixed(1)} ms`);
    return new Promise(resolve => {
      if (antialias) {
        setTimeout(() => {
          const startAA = performance.now();
          renderAntialiased({tiles: this.tiles, pixels: this.pixels, canvas: this.canvas_});
          console.log(`antialias: ${(performance.now() - startAA).toFixed(1)} ms`);
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  recolor() {
    const start = performance.now();
    for (let tile of this.tiles) {
      tile.color[0] = rand(256);
      tile.color[1] = rand(256);
      tile.color[2] = rand(256);
    }
    render({tiles: this.tiles, pixels: this.pixels, canvas: this.canvas_});  
    console.log(`recolor: ${(performance.now() - start).toFixed(1)} ms`);
  }

  toggleAA() {
    const start = performance.now();
    antialias = !antialias;
    if (antialias) {
      renderAntialiased({tiles: this.tiles, pixels: this.pixels, canvas: this.canvas_});
    } else {
      render({tiles: this.tiles, pixels: this.pixels, canvas: this.canvas_});
    }
    console.log(`toggle AA: ${(performance.now() - start).toFixed(1)} ms`);
  }

  toggleCapitols() {
    const start = performance.now();
    showCapitols = !showCapitols;
    drawCapitols({tiles: this.tiles, pixels: this.pixels, canvas: this.canvas_});
    this.canvas_.repaint();
    console.log(`toggle capitols: ${(performance.now() - start).toFixed(1)} ms`);
  }
}

function placeCapitols({width, height, numTiles}) {
  const tiles = new Array(numTiles);
  const capitols = new Set();
  for (let i = 0; i < numTiles; i++) {
    let x = rand(width);
    let y = rand(height);
    while (capitols.has(pair(x, y))) {
      x = rand(width);
      y = rand(height);
    }
    capitols.add(pair(x, y));
    const color = new Uint8ClampedArray([rand(256), rand(256), rand(256)]);
    tiles[i] = {x, y, color};
  }
  return tiles;
}

function partition({width, height, tiles, sortedLattice}) {
  bordersKnown = false;
  const pixels = new Array(height).fill().map(() => new Array(width));
  const thisSeemsToWork = 2.34 * (width + height) ** 2 / tiles.length;
  const expandArea = Math.min(thisSeemsToWork, sortedLattice.length);
  // partition by expanding circles
  for (let i = 0; i < expandArea; i += 2) {
    const dx = sortedLattice[i];
    const dy = sortedLattice[i + 1];
    for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
      const tile = tiles[tileIndex];
      const x = tile.x + dx;
      const y = tile.y + dy;
      if (0 <= y && y < height && 0 <= x && x < width && pixels[y][x] === undefined) {
        pixels[y][x] = tileIndex;
      }
    }
  }
  return pixels;
}

function render({tiles, pixels, canvas}) {
  const width = canvas.width;
  const height = canvas.height;
  for (let y = 0; y < height; y++) {
    const row = pixels[y];
    for (let x = 0; x < width; x++) {
      // fill in un-partitioned pixels
      if (row[x] === undefined) {
        let closestTileIndex;
        let minDist = Infinity;
        for (let i = 0; i < tiles.length; i++) {
          const tile = tiles[i];
          const dist = euclideanDist(x, y, tile.x, tile.y);
          if (dist < minDist) {
            minDist = dist;
            closestTileIndex = i;
          }
        }
        row[x] = closestTileIndex;
      }
      canvas.setPixel(x, y, tiles[row[x]].color);
    }
  }
  if (showCapitols) {
    drawCapitols({tiles, pixels, canvas});
  }
  canvas.repaint();
}

function drawCapitols({tiles, pixels, canvas}) {
  tiles.forEach(({x, y}) => {
    const color = tiles[pixels[y][x]].color;
    canvas.setPixel(x, y, showCapitols ? color.map(c => (c + 128) % 256) : color);
  })
}

function renderAntialiased({tiles, pixels, canvas}) {
  const width = canvas.width;
  const height = canvas.height;
  if (bordersKnown) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const subpixels = borderPixels[y][x];
        if (subpixels !== undefined) {
          canvas.setPixel(x, y, averageSubpixels(subpixels, tiles));
        }
      }
    }
  } else {
    // borders unknown - so we must calculate them
    if (borderPixels === undefined) {
      borderPixels = new Array(height);
    }
    for (let y = 0; y < height; y++) {
      if (borderPixels[y] === undefined) {
        borderPixels[y] = new Array(width);
      }
      for (let x = 0; x < width; x++) {
        // determine the tiles to which each neighbor pixel belongs
        const nbrTileIndices = getNbrTileIndices(x, y, width, height, pixels);
        // if this is a border pixel, then sample subpixels
        if (nbrTileIndices.some(nbrIndex => nbrIndex !== pixels[y][x])) {
          const subpixels = getSubpixelTileIndices(x, y, tiles, nbrTileIndices);
          borderPixels[y][x] = subpixels;
          canvas.setPixel(x, y, averageSubpixels(subpixels, tiles));
        } else {
          borderPixels[y][x] = undefined;
        }
      }
    }
    bordersKnown = true;
  }
  canvas.repaint();
}

function getNbrTileIndices(x, y, width, height, pixels) {
  const nbrTileIndices = new Array(NEIGHBOR_OFFSETS.length);
  let i = 0;
  NEIGHBOR_OFFSETS.forEach(([dx, dy]) => {
    const nbrX = x + dx;
    const nbrY = y + dy;
    let nbrIndex;
    if (0 <= nbrY && nbrY < height && 0 <= nbrX && nbrX < width &&
        !nbrTileIndices.includes(nbrIndex = pixels[nbrY][nbrX])) {
      nbrTileIndices[i++] = nbrIndex;
    }
  });
  return nbrTileIndices;
}

function getSubpixelTileIndices(x, y, tiles, nbrTileIndices) {
  return SUBPIXEL_OFFSETS.map(([dx, dy]) => {
    const subpixelX = x + dx;
    const subpixelY = y + dy;
    let closestTileIndex;
    let minDist = Infinity;
    nbrTileIndices.forEach(i => {
      const tile = tiles[i];
      const dist = euclideanDist(subpixelX, subpixelY, tile.x, tile.y);
      if (dist < minDist) {
        minDist = dist;
        closestTileIndex = i;
      }
    });
    return closestTileIndex;
  });
}
