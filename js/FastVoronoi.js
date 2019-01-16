import {averageSubpixels, euclideanDist, extractUrlParams, pair, rand} from './util.js';

const SUBPIXEL_OFFSETS = [
  [-1/3, -1/3], [0, -1/3], [1/3, -1/3],
  [-1/3,    0], [0,    0], [1/3,    0],
  [-1/3,  1/3], [0,  1/3], [1/3,  1/3],
];

const urlParams = extractUrlParams();

let antialias = urlParams.a !== 'false';
let showCapitols = urlParams.t === 'true';
let capitolArea;
let numTiles;

let borderPixels;
let bordersKnown = false;

export default class FastVoronoi {
  constructor(canvas, sortedLattice) {
    numTiles = parseInt(urlParams.n) ||
        Math.round(window.innerWidth * window.innerHeight / 3000);
    capitolArea = Math.min(
        sortedLattice.length,
        Math.ceil(canvas.width * canvas.height / (100 * numTiles)));
    this.canvas_ = canvas;
    this.sortedLattice_ = sortedLattice;
    this.randomize(numTiles);
  }

  randomize(numTiles) {
    const start = performance.now();
    this.tiles = placeCapitols(this.canvas_.width, this.canvas_.height);
    this.pixels = partition(
        this.canvas_.width, this.canvas_.height, this.tiles, this.sortedLattice_);
    render(this.tiles, this.pixels, this.canvas_, this.sortedLattice_);
    this.canvas_.repaint();
    console.log(`randomize: ${(performance.now() - start).toFixed(1)} ms`);
    return new Promise(resolve => {
      if (antialias) {
        setTimeout(() => {
          const startAA = performance.now();
          renderAntialiasedBorders(this.tiles, this.pixels, this.canvas_);
          this.canvas_.repaint();
          console.log(
              `antialias: ${(performance.now() - startAA).toFixed(1)} ms`);
          resolve();
        }, 0);
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
    render(this.tiles, this.pixels, this.canvas_, this.sortedLattice_);
    if (antialias) {
      renderAntialiasedBorders(this.tiles, this.pixels, this.canvas_);
    }
    this.canvas_.repaint();
    console.log(`recolor: ${(performance.now() - start).toFixed(1)} ms`);
  }

  toggleAA() {
    const start = performance.now();
    antialias = !antialias;
    if (antialias) {
      renderAntialiasedBorders(this.tiles, this.pixels, this.canvas_);
    } else {
      render(this.tiles, this.pixels, this.canvas_, this.sortedLattice_);
    }
    this.canvas_.repaint();
    console.log(`toggle AA: ${(performance.now() - start).toFixed(1)} ms`);
  }

  toggleCapitols() {
    const start = performance.now();
    showCapitols = !showCapitols;
    drawCapitols(this.tiles, this.pixels, this.canvas_, this.sortedLattice_);
    this.canvas_.repaint();
    console.log(
        `toggle capitols: ${(performance.now() - start).toFixed(1)} ms`);
  }
}

function placeCapitols(width, height) {
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

function partition(width, height, tiles, sortedLattice) {
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
      if (0 <= y && y < height && 0 <= x && x < width &&
          pixels[y][x] === undefined) {
        pixels[y][x] = tileIndex;
      }
    }
  }
  return pixels;
}

function render(tiles, pixels, canvas, sortedLattice) {
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
    drawCapitols(tiles, pixels, canvas, sortedLattice);
  }
}

function drawCapitols(tiles, pixels, canvas, sortedLattice) {
  for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
    const {x, y, color} = tiles[tileIndex];
    const capColor = showCapitols ? color.map(c => (c + 128) % 256) : color;
    for (let i = 0; i < capitolArea; i += 2) {
      const capX = x + sortedLattice[i];
      const capY = y + sortedLattice[i + 1];
      if (pixels[capY] !== undefined && pixels[capY][capX] === tileIndex) {
        canvas.setPixel(capX, capY, capColor);
      }
    }
  }
}

function renderAntialiasedBorders(tiles, pixels, canvas) {
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
    calculateNbrTileIndices(height, width, pixels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // determine the tiles to which each neighbor pixel belongs
        const nbrTileIndices = borderPixels[y][x];
        // if this is a border pixel, then sample subpixels
        if (nbrTileIndices !== undefined) {
          const subpixels = getSubpixelTileIndices(
              x, y, tiles, pixels[y][x], nbrTileIndices);
          borderPixels[y][x] = subpixels;
          canvas.setPixel(x, y, averageSubpixels(subpixels, tiles));
        }
      }
    }

    bordersKnown = true;
  }
}

Array.prototype.add = function(e) {
  if (!this.includes(e)) {
    this.push(e);
  }
  return this;
};

function calculateNbrTileIndices(height, width, pixels) {
  if (borderPixels === undefined) {
    borderPixels = new Array(height);
  }
  const widthMinusOne = width - 1;
  for (let y = 0; y < height; y++) {
    borderPixels[y] = new Array(width);
    for (let x = 0; x < widthMinusOne; x++) {
      if (pixels[y][x] !== pixels[y][x + 1]) {
        borderPixels[y][x] = (borderPixels[y][x] || []).add(pixels[y][x + 1]);
        borderPixels[y][x + 1] = [pixels[y][x]];
      }
    }
  }
  const heightMinusOne = height - 1;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < heightMinusOne; y++) {
      if (pixels[y][x] !== pixels[y + 1][x]) {
        borderPixels[y][x] = (borderPixels[y][x] || []).add(pixels[y + 1][x]);
        borderPixels[y + 1][x] = (borderPixels[y + 1][x] || []).add(pixels[y][x]);
      }
    }
  }
}

function getSubpixelTileIndices(x, y, tiles, pixelIndex, nbrTileIndices) {
  const tile = tiles[pixelIndex];
  return SUBPIXEL_OFFSETS.map(([dx, dy]) => {
    const subpixelX = x + dx;
    const subpixelY = y + dy;
    let closestTileIndex = pixelIndex;
    let minDist = euclideanDist(subpixelX, subpixelY, tile.x, tile.y);
    nbrTileIndices.forEach(i => {
      const nbrTile = tiles[i];
      const dist = euclideanDist(subpixelX, subpixelY, nbrTile.x, nbrTile.y);
      if (dist < minDist) {
        minDist = dist;
        closestTileIndex = i;
      }
    });
    return closestTileIndex;
  });
}
