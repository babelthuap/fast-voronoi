import {averageSubpixels, euclideanDist, extractUrlParams, pair, rand} from './util.js';

const SUBPIXEL_OFFSETS = [
  [-1/3, -1/3], [0, -1/3], [1/3, -1/3],
  [-1/3,    0], [0,    0], [1/3,    0],
  [-1/3,  1/3], [0,  1/3], [1/3,  1/3],
];

const NUM_COLORS = 256 ** 3;
const MASK_8_BIT = 0xff;

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
    this.firstRenderPromise = this.randomize(numTiles);
  }

  randomize(numTiles) {
    const start = performance.now();

    return new Promise(resolve => {
      requestAnimationFrame(() => {
        this.tiles = placeCapitols(this.canvas_.width, this.canvas_.height);
        this.pixels = partition(
            this.canvas_.width, this.canvas_.height, this.tiles,
            this.sortedLattice_);
        render(this.tiles, this.pixels, this.canvas_, this.sortedLattice_);
        this.canvas_.repaint();
        console.log(`randomize: ${(performance.now() - start).toFixed(0)} ms`);

        if (antialias) {
          const startAA = performance.now();
          requestAnimationFrame(() => {
            renderAntialiasedBorders(this.tiles, this.pixels, this.canvas_);
            this.canvas_.repaint();
            console.log(
                `antialias: ${(performance.now() - startAA).toFixed(0)} ms`);
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }

  recolor() {
    const start = performance.now();
    for (let i = 0; i < this.tiles.length; i++) {
      const tile = this.tiles[i];
      tile.color[0] = rand(256);
      tile.color[1] = rand(256);
      tile.color[2] = rand(256);
    }
    render(this.tiles, this.pixels, this.canvas_, this.sortedLattice_);
    if (antialias) {
      renderAntialiasedBorders(this.tiles, this.pixels, this.canvas_);
    }
    this.canvas_.repaint();
    console.log(`recolor: ${(performance.now() - start).toFixed(0)} ms`);
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
    console.log(`toggle AA: ${(performance.now() - start).toFixed(0)} ms`);
  }

  toggleCapitols() {
    const start = performance.now();
    showCapitols = !showCapitols;
    drawCapitols(this.tiles, this.pixels, this.canvas_, this.sortedLattice_);
    this.canvas_.repaint();
    console.log(
        `toggle capitols: ${(performance.now() - start).toFixed(0)} ms`);
  }
}

function placeCapitols(width, height) {
  const tiles = new Array(numTiles);
  // enforce distinct positions for each tile capitol
  const capitols = new Set();
  // enforce distinct colors for each tile
  const colors = new Set();
  for (let i = 0; i < numTiles; i++) {
    // choose position
    let x = rand(width);
    let y = rand(height);
    while (capitols.has(pair(x, y))) {
      x = rand(width);
      y = rand(height);
    }
    capitols.add(pair(x, y));
    // choose color
    let colorInt = rand(NUM_COLORS);
    while (colors.has(colorInt)) {
      colorInt = rand(NUM_COLORS);
    }
    colors.add(colorInt);
    const color = new Uint8ClampedArray([
      colorInt >> 16,
      (colorInt >> 8) & MASK_8_BIT,
      colorInt & MASK_8_BIT,
    ]);
    tiles[i] = {x, y, color};
  }
  return tiles;
}

function partition(width, height, tiles, sortedLattice) {
  bordersKnown = false;
  const pixels = new Array(width * height);
  const thisSeemsToWork = 2.34 * (width + height) ** 2 / tiles.length;
  const expandArea = Math.min(thisSeemsToWork, sortedLattice.length);
  // partition by expanding circles
  for (let i = 0; i < expandArea; i += 2) {
    const dx = sortedLattice[i];
    const dy = sortedLattice[i + 1];
    for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
      const tile = tiles[tileIndex];
      const y = tile.y + dy;
      if (y < height && y >= 0) {
        const x = tile.x + dx;
        if (x >= 0 && x < width) {
          const pixelIndex = x + width * y;
          if (pixels[pixelIndex] === undefined) {
            pixels[pixelIndex] = tileIndex;
          }
        }
      }
    }
  }
  return pixels;
}

// TODO: optimize by bucketing cell captiols
const findClosestTile = (pixelIndex, width, tiles) => {
  const x = pixelIndex % width;
  const y = (pixelIndex - x) / width;
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
  return closestTileIndex;
};

function render(tiles, pixels, canvas, sortedLattice) {
  const width = canvas.width;
  const height = canvas.height;
  const getOrCalculatePixel = (pixelIndex) => {
    const tileIndex = pixels[pixelIndex];
    return tileIndex === undefined ?
        pixels[pixelIndex] = findClosestTile(pixelIndex, width, tiles) :
        tileIndex;
  };
  // render each row
  for (let y = 0; y < height; y++) {
    const rowOffset = width * y;
    const rowEnd = width + rowOffset;
    // TODO: use the insight that cell borders don't change much from row to row
    for (let left = rowOffset; left < rowEnd; /* increment handled below */) {
      let tileIndex = pixels[left];
      if (tileIndex === undefined) {
        // fill in un-partitioned pixels: starting at left, binary search for
        // border with next color in this row, then fill the pixels in between
        tileIndex = (pixels[left] = findClosestTile(left, width, tiles));
        let right = rowOffset + width - 1;
        if (getOrCalculatePixel(right) !== tileIndex) {
          // search for border
          let step = Math.max((right - left) >> 1, 1);
          do {
            if (pixels[right] === tileIndex) {
              right += step;
            } else {
              right -= step;
            }
            if (step > 1) {
              step >>= 1;
            }
          } while (getOrCalculatePixel(right) !== tileIndex ||
                   getOrCalculatePixel(right + 1) === tileIndex);
        }
        for (let pixelIndex = left; pixelIndex <= right; pixelIndex++) {
          pixels[pixelIndex] = tileIndex;
          canvas.setPixel(pixelIndex, tiles[tileIndex].color);
        }
        left = right + 1;
      } else {
        // color in known pixels
        canvas.setPixel(left, tiles[tileIndex].color);
        left++;
      }
    }
  }
  if (showCapitols) {
    drawCapitols(tiles, pixels, canvas, sortedLattice);
  }
}

function drawCapitols(tiles, pixels, canvas, sortedLattice) {
  const width = canvas.width;
  const height = canvas.height;
  for (let tileIndex = 0; tileIndex < tiles.length; tileIndex++) {
    const {x, y, color} = tiles[tileIndex];
    const capColor = showCapitols ? color.map(c => (c + 128) % 256) : color;
    for (let i = 0; i < capitolArea; i += 2) {
      const capX = x + sortedLattice[i];
      const capY = y + sortedLattice[i + 1];
      const pixelIndex = capX + width * capY;
      if (capY < height && pixels[pixelIndex] === tileIndex) {
        canvas.setPixel(pixelIndex, capColor);
      }
    }
  }
}

function renderAntialiasedBorders(tiles, pixels, canvas) {
  const width = canvas.width;
  const height = canvas.height;
  if (bordersKnown) {
    for (let y = 0; y < height; y++) {
      const rowOffset = width * y;
      for (let x = 0; x < width; x++) {
        const subpixels = borderPixels[y][x];
        if (subpixels !== undefined) {
          canvas.setPixel(x + rowOffset, averageSubpixels(subpixels, tiles));
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
          const pixelIndex = x + width * y;
          const subpixels =
              getSubpixelTileIndices(x, y, tiles, pixels[pixelIndex], nbrTileIndices);
          borderPixels[y][x] = subpixels;
          canvas.setPixel(pixelIndex, averageSubpixels(subpixels, tiles));
        }
      }
    }

    bordersKnown = true;
  }
}

function add(arr, e) {
  if (!arr.includes(e)) {
    arr.push(e);
  }
  return arr;
};

function calculateNbrTileIndices(height, width, pixels) {
  if (borderPixels === undefined) {
    borderPixels = new Array(height);
  }
  const widthMinusOne = width - 1;
  for (let y = 0; y < height; y++) {
    const row = borderPixels[y] = new Array(width);
    for (let x = 0; x < widthMinusOne; x++) {
      const pixelIndex = x + width * y;
      if (pixels[pixelIndex] !== pixels[pixelIndex + 1]) {
        row[x] = add(row[x] || [], pixels[pixelIndex + 1]);
        row[x + 1] = [pixels[pixelIndex]];
      }
    }
  }
  const heightMinusOne = height - 1;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < heightMinusOne; y++) {
      const pixelIndex = x + width * y;
      if (pixels[pixelIndex] !== pixels[pixelIndex + width]) {
        borderPixels[y][x] =
            add(borderPixels[y][x] || [], pixels[pixelIndex + width]);
        borderPixels[y + 1][x] =
            add(borderPixels[y + 1][x] || [], pixels[pixelIndex]);
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
    for (let i = 0; i < nbrTileIndices.length; i++) {
      const index = nbrTileIndices[i];
      const nbrTile = tiles[index];
      const dist = euclideanDist(subpixelX, subpixelY, nbrTile.x, nbrTile.y);
      if (dist < minDist) {
        minDist = dist;
        closestTileIndex = index;
      }
    }
    return closestTileIndex;
  });
}
