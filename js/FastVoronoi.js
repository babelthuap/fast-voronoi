import {extractUrlParams, rand} from './util.js';

let antialias = 'aa' in extractUrlParams();

export default class FastVoronoi {
  constructor({canvas, numTiles, sortedLattice}) {
    this.canvas_ = canvas;
    this.sortedLattice_ = sortedLattice;
    this.randomize(numTiles);
  }

  randomize(numTiles) {
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
  }

  recolor() {
    for (let tile of this.tiles) {
      tile.color[0] = rand(256);
      tile.color[1] = rand(256);
      tile.color[2] = rand(256);
    }
    render({tiles: this.tiles, pixels: this.pixels, canvas: this.canvas_});  
  }

  toggleAA() {
    antialias = !antialias;
    render({tiles: this.tiles, pixels: this.pixels, canvas: this.canvas_});
  }
}

function placeCapitols({width, height, numTiles}) {
  const tiles = new Array(numTiles);
  const capitols = {};
  for (let i = 0; i < numTiles; i++) {
    let x = rand(width);
    let y = rand(height);
    ////////////////////////////
    // ensure unique capitols //
    if (!capitols[x]) {
      capitols[x] = {};
    }
    while (capitols[x][y]) {
      x = rand(width);
      y = rand(height);
      if (!capitols[x]) {
        capitols[x] = {};
      }
    }
    capitols[x][y] = true;
    ////////////////////////////
    const color = new Uint8ClampedArray([rand(256), rand(256), rand(256)]);
    tiles[i] = {x, y, color};
  }
  return tiles;
}

function euclideanDist(x1, y1, x2, y2) {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

function partition({width, height, tiles, sortedLattice}) {
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
      if (0 <= y && y < height && pixels[y][x] === undefined) {
        pixels[y][x] = tileIndex;
      }
    }
  }
  // fill in un-partitioned pixels
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[y][x] === undefined) {
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
        pixels[y][x] = closestTileIndex;
      }
    }
  }
  return pixels;
}

const NEIGHBOR_OFFSETS = [
           [0, -1],
  [-1, 0],          [1, 0],
           [0,  1],
];

const SUBPIXELS = [
  [-.25, -.25], [.25, -.25],
  [-.25,  .25], [.25,  .25],
];

function render({tiles, pixels, canvas}) {
  const width = canvas.width;
  const height = canvas.height;

  // don't use antialiasing
  if (!antialias) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        canvas.setPixel(x, y, tiles[pixels[y][x]].color);
      }
    }
    canvas.repaint();
    return;
  }

  // use antialiasing
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nbrTileIndices = [];
      NEIGHBOR_OFFSETS.forEach(([dx, dy]) => {
        const nbrX = x + dx;
        const nbrY = y + dy;
        if (pixels[nbrY] !== undefined && pixels[nbrY][nbrX] !== undefined) {
          nbrTileIndices.push(pixels[nbrY][nbrX]);
        }
      });
      if (nbrTileIndices.some(nbrIdx => nbrIdx !== pixels[y][x])) {
        const avgColor = new Array(3).fill(0);
        SUBPIXELS.forEach(([dx, dy]) => {
          const subpixelX = x + dx;
          const subpixelY = y + dy;
          let closestTileIndex;
          let minDist = Infinity;
          for (let i of nbrTileIndices) {
            const tile = tiles[i];
            const dist = euclideanDist(subpixelX, subpixelY, tile.x, tile.y);
            if (dist < minDist) {
              minDist = dist;
              closestTileIndex = i;
            }
          }
          const color = tiles[closestTileIndex].color;
          avgColor[0] += color[0] / SUBPIXELS.length;
          avgColor[1] += color[1] / SUBPIXELS.length;
          avgColor[2] += color[2] / SUBPIXELS.length;
        });
        canvas.setPixel(x, y, avgColor);
      } else {
        canvas.setPixel(x, y, tiles[pixels[y][x]].color);
      }
    }
  }
  canvas.repaint();
}
