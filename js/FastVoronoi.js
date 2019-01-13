import {rand} from './util.js';

export default class FastVoronoi {
  constructor({canvas, numTiles, sortedLattice}) {
    this.canvas_ = canvas;
    this.sortedLattice_ = sortedLattice;
    this.rerender(numTiles);
  }

  rerender(numTiles) {
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
    render({
      tiles: this.tiles,
      pixels: this.pixels,
      canvas: this.canvas_,
    });
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
          const dist = (x - tile.x) ** 2 + (y - tile.y) ** 2;
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

function render({tiles, pixels, canvas}) {
  for (let y = 0; y < pixels.length; y++) {
    const row = pixels[y];
    for (let x = 0; x < row.length; x++) {
      canvas.setPixel(x, y, tiles[row[x]].color);
    }
  }
  canvas.repaint();
}
