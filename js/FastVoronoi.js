import {averageSubpixels, euclideanDist, pair, rand} from './util.js';

const SUBPIXEL_OFFSETS = [
  [-1/3, -1/3], [0, -1/3], [1/3, -1/3],
  [-1/3,    0], [0,    0], [1/3,    0],
  [-1/3,  1/3], [0,  1/3], [1/3,  1/3],
];

const NUM_COLORS = 256 ** 3;
const MASK_8_BIT = 0xff;

const URL_PARAMS = new URLSearchParams(window.location.search);
const NUM_TILES = parseInt(URL_PARAMS.get('n')) ||
    Math.round(window.innerWidth * window.innerHeight / 3000);
const WIDTH = window.innerWidth;
const HEIGHT = window.innerHeight;
const NUM_PIXELS = WIDTH * HEIGHT;
const UNSET_ID = NUM_TILES < 0xff ? 0xff : 0xffff;
const IMAGE_URL = URL_PARAMS.get('url');

// reuse these across renders to reduce garbage collection time
const pixels =
    NUM_TILES < 0xff ? new Uint8Array(NUM_PIXELS) : new Uint16Array(NUM_PIXELS);
const tiles = new Array(NUM_TILES);

let antialias = URL_PARAMS.get('a') !== 'false';
let showCapitols = URL_PARAMS.get('t') === 'true';
let capitolArea;

let borderGuesses;

let borderPixels;
let bordersKnown = false;

export default class FastVoronoi {
  constructor(canvas, sortedLattice) {
    capitolArea = Math.min(
        sortedLattice.length, Math.ceil(WIDTH * HEIGHT / (100 * NUM_TILES)));
    this.canvas_ = canvas;
    this.sortedLattice_ = sortedLattice;
    this.firstRenderPromise = this.randomize(NUM_TILES);
  }

  randomize(NUM_TILES) {
    const start = performance.now();
    return new Promise(resolve => {
      requestAnimationFrame(() => {
        placeCapitols();
        partition(this.sortedLattice_);
        render(this.canvas_, this.sortedLattice_);
        if (IMAGE_URL) {
          this.renderImage(IMAGE_URL).then(() => {
            if (antialias) {
              renderAntialiasedBorders(this.canvas_);
            }
            this.canvas_.repaint();
            const duration = performance.now() - start;
            console.log(`renderImage: ${duration.toFixed(0)} ms`);
            resolve(duration);
          });
        } else if (antialias) {
          this.canvas_.repaint();
          requestAnimationFrame(() => {
            renderAntialiasedBorders(this.canvas_);
            this.canvas_.repaint();
            const duration = performance.now() - start;
            console.log(`randomize + AA: ${duration.toFixed(0)} ms`);
            resolve(duration);
          });
        } else {
          this.canvas_.repaint();
          const duration = performance.now() - start;
          console.log(`randomize: ${duration.toFixed(0)} ms`);
          resolve(duration);
        }
      });
    });
  }

  recolor() {
    const start = performance.now();
    for (let i = 0; i < NUM_TILES; i++) {
      const tile = tiles[i];
      tile.color[0] = rand(256);
      tile.color[1] = rand(256);
      tile.color[2] = rand(256);
    }
    render(this.canvas_, this.sortedLattice_);
    if (antialias) {
      renderAntialiasedBorders(this.canvas_);
    }
    this.canvas_.repaint();
    console.log(`recolor: ${(performance.now() - start).toFixed(0)} ms`);
  }

  renderImage(url) {
    return new Promise(resolve => {
      const imageCanvas = document.createElement('canvas');
      imageCanvas.width = WIDTH;
      imageCanvas.height = HEIGHT;
      const image = new Image();
      image.crossOrigin = 'Anonymous';
      image.src = url;
      image.addEventListener('load', () => {
        // stretch image onto a full-window canvas
        const ctx = imageCanvas.getContext('2d');
        ctx.drawImage(
            image,
            /* source: */ 0, 0, image.width, image.height,
            /* destination: */ 0, 0, WIDTH, HEIGHT);
        const imgPixelData = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;

        // determine new tile colors
        const newTileColors = tiles.map(tile => {
          return {count: 0, rgb: new Uint32Array(3)};
        });
        for (let pixelIndex = 0; pixelIndex < NUM_PIXELS; ++pixelIndex) {
          const tileIndex = pixels[pixelIndex];
          const newColor = newTileColors[tileIndex];
          newColor.count += 1;
          const imgR = pixelIndex << 2;
          newColor.rgb[0] += imgPixelData[imgR];
          newColor.rgb[1] += imgPixelData[imgR + 1];
          newColor.rgb[2] += imgPixelData[imgR + 2];
        }

        // recolor
        for (let tileIndex = 0; tileIndex < NUM_TILES; tileIndex++) {
          const tile = tiles[tileIndex];
          const newColor = newTileColors[tileIndex];
          tile.color[0] = newColor.rgb[0] / newColor.count;
          tile.color[1] = newColor.rgb[1] / newColor.count;
          tile.color[2] = newColor.rgb[2] / newColor.count;
        }
        render(this.canvas_, this.sortedLattice_);
        resolve();
      });
    });
  }

  toggleAA() {
    const start = performance.now();
    antialias = !antialias;
    if (antialias) {
      renderAntialiasedBorders(this.canvas_);
    } else {
      render(this.canvas_, this.sortedLattice_);
    }
    this.canvas_.repaint();
    console.log(`toggle AA: ${(performance.now() - start).toFixed(0)} ms`);
  }

  toggleCapitols() {
    const start = performance.now();
    showCapitols = !showCapitols;
    drawCapitols(this.canvas_, this.sortedLattice_);
    this.canvas_.repaint();
    console.log(
        `toggle capitols: ${(performance.now() - start).toFixed(0)} ms`);
  }
}

function placeCapitols() {
  // enforce distinct positions for each tile capitol
  const capitols = new Set();
  // enforce distinct colors for each tile
  const colors = new Set();
  for (let i = 0; i < NUM_TILES; i++) {
    // choose position
    let x = rand(WIDTH);
    let y = rand(HEIGHT);
    while (capitols.has(pair(x, y))) {
      x = rand(WIDTH);
      y = rand(HEIGHT);
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

function partition(sortedLattice) {
  bordersKnown = false;
  pixels.fill(UNSET_ID);
  const thisSeemsToWork = 2.34 * (WIDTH + HEIGHT) ** 2 / NUM_TILES;
  const expandArea = Math.min(thisSeemsToWork, sortedLattice.length);
  // partition by expanding circles
  for (let i = 0; i < expandArea; i += 2) {
    const dx = sortedLattice[i];
    const dy = sortedLattice[i + 1];
    for (let tileIndex = 0; tileIndex < NUM_TILES; tileIndex++) {
      const tile = tiles[tileIndex];
      const y = tile.y + dy;
      if (y < HEIGHT && y >= 0) {
        const x = tile.x + dx;
        if (x >= 0 && x < WIDTH) {
          const pixelIndex = x + WIDTH * y;
          if (pixels[pixelIndex] === UNSET_ID) {
            pixels[pixelIndex] = tileIndex;
          }
        }
      }
    }
  }
  return pixels;
}

// TODO: optimize by bucketing cell captiols
const findClosestTile = (pixelIndex, tiles) => {
  const x = pixelIndex % WIDTH;
  const y = (pixelIndex - x) / WIDTH;
  let closestTileIndex;
  let minDist = Infinity;
  for (let i = 0; i < NUM_TILES; i++) {
    const tile = tiles[i];
    const dist = euclideanDist(x, y, tile.x, tile.y);
    if (dist < minDist) {
      minDist = dist;
      closestTileIndex = i;
    }
  }
  return closestTileIndex;
};

function render(canvas, sortedLattice) {
  const borderGuesses = calculateBorderGuesses();
  const getOrCalculatePixelSimple = (pixelIndex) => {
    const tileIndex = pixels[pixelIndex];
    return tileIndex === UNSET_ID ?
        pixels[pixelIndex] = findClosestTile(pixelIndex, tiles) :
        tileIndex;
  };
  const getOrCalculatePixelCheckConvexity = (pixelIndex) => {
    let tileIndex = pixels[pixelIndex];
    if (tileIndex === UNSET_ID) {
      // if the up and down neighbors are the same, then this must be, too
      const upTileIndex = pixels[pixelIndex - WIDTH];
      if (upTileIndex === pixels[pixelIndex + WIDTH] /* downTileIndex */) {
        return pixels[pixelIndex] = upTileIndex;
      } else {
        return pixels[pixelIndex] = findClosestTile(pixelIndex, tiles);
      }
    } else {
      return tileIndex;
    }
  };

  // render even rows
  for (let y = 0; y < HEIGHT; y += 2) {
    renderRow(y, borderGuesses, canvas, getOrCalculatePixelSimple);
  }
  // render odd rows, taking advantage of convexity
  for (let y = 1; y < HEIGHT - 1; y += 2) {
    renderRow(y, borderGuesses, canvas, getOrCalculatePixelCheckConvexity);
  }
  // if HEIGHT is even, then bottom row is odd, so hasn't been rendered yet
  if (HEIGHT % 2 === 0) {
    renderRow(HEIGHT - 1, borderGuesses, canvas, getOrCalculatePixelSimple);
  }

  if (showCapitols) {
    drawCapitols(canvas, sortedLattice);
  }
}

function calculateBorderGuesses() {
  if (borderGuesses !== undefined) {
    return borderGuesses;
  }
  const expectedTilesPerRow = Math.floor(Math.sqrt(WIDTH * NUM_TILES / HEIGHT));
  borderGuesses = new Array(expectedTilesPerRow);
  for (let i = 0; i < expectedTilesPerRow; i++) {
    borderGuesses[i] = Math.round((i + 1) * WIDTH / expectedTilesPerRow) - 1;
  }
  return borderGuesses;
}

function renderRow(y, borderGuesses, canvas, getOrCalculatePixel) {
  const rowOffset = WIDTH * y;
  const rowEnd = rowOffset + WIDTH;
  let left = rowOffset;
  let guessI = 0;
  while (left < rowEnd) {
    let tileIndex = pixels[left];
    if (tileIndex === UNSET_ID) {
      // fill in un-partitioned pixels: starting at left, search for the border
      // with next color in this row, then fill the pixels in between
      tileIndex = getOrCalculatePixel(left);

      // make an educated guess about where the next tile will be
      while (rowOffset + borderGuesses[guessI] <= left &&
             guessI < borderGuesses.length - 1) {
        guessI++;
      }
      let right = rowOffset + borderGuesses[guessI];
      while (getOrCalculatePixel(right) === tileIndex &&
             guessI < borderGuesses.length - 1) {
        guessI++;
        right = rowOffset + borderGuesses[guessI];
      }

      // search for border
      if (getOrCalculatePixel(right) !== tileIndex) {
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

      // fill line of same-color pixels
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

function drawCapitols(canvas, sortedLattice) {
  for (let tileIndex = 0; tileIndex < NUM_TILES; tileIndex++) {
    const {x, y, color} = tiles[tileIndex];
    const capColor = showCapitols ? color.map(c => (c + 128) % 256) : color;
    for (let i = 0; i < capitolArea; i += 2) {
      const capX = x + sortedLattice[i];
      const capY = y + sortedLattice[i + 1];
      const pixelIndex = capX + WIDTH * capY;
      if (capY < HEIGHT && pixels[pixelIndex] === tileIndex) {
        canvas.setPixel(pixelIndex, capColor);
      }
    }
  }
}

function renderAntialiasedBorders(canvas) {
  if (bordersKnown) {
    for (let y = 0; y < HEIGHT; y++) {
      const rowOffset = WIDTH * y;
      for (let x = 0; x < WIDTH; x++) {
        const subpixels = borderPixels[y][x];
        if (subpixels !== undefined) {
          canvas.setPixel(x + rowOffset, averageSubpixels(subpixels, tiles));
        }
      }
    }
  } else {
    // borders unknown - so we must calculate them
    calculateNbrTileIndices(pixels);
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        // determine the tiles to which each neighbor pixel belongs
        const nbrTileIndices = borderPixels[y][x];
        // if this is a border pixel, then sample subpixels
        if (nbrTileIndices !== undefined) {
          const pixelIndex = x + WIDTH * y;
          const subpixels = getSubpixelTileIndices(
              x, y, tiles, pixels[pixelIndex], nbrTileIndices);
          borderPixels[y][x] = subpixels;
          canvas.setPixel(pixelIndex, averageSubpixels(subpixels, tiles));
        }
      }
    }

    bordersKnown = true;
  }
}

const add = (arr, e) => {
  if (!arr.includes(e)) {
    arr.push(e);
  }
  return arr;
};

function calculateNbrTileIndices(pixels) {
  if (borderPixels === undefined) {
    borderPixels = new Array(HEIGHT);
  }
  const widthMinusOne = WIDTH - 1;
  for (let y = 0; y < HEIGHT; y++) {
    const row = borderPixels[y] = new Array(WIDTH);
    for (let x = 0; x < widthMinusOne; x++) {
      const pixelIndex = x + WIDTH * y;
      if (pixels[pixelIndex] !== pixels[pixelIndex + 1]) {
        row[x] = add(row[x] || [], pixels[pixelIndex + 1]);
        row[x + 1] = [pixels[pixelIndex]];
      }
    }
  }
  const heightMinusOne = HEIGHT - 1;
  for (let x = 0; x < WIDTH; x++) {
    for (let y = 0; y < heightMinusOne; y++) {
      const pixelIndex = x + WIDTH * y;
      if (pixels[pixelIndex] !== pixels[pixelIndex + WIDTH]) {
        borderPixels[y][x] =
            add(borderPixels[y][x] || [], pixels[pixelIndex + WIDTH]);
        borderPixels[y + 1][x] =
            add(borderPixels[y + 1][x] || [], pixels[pixelIndex]);
      }
    }
  }
}

function getSubpixelTileIndices(x, y, tiles, tileIndex, nbrTileIndices) {
  const tile = tiles[tileIndex];
  return SUBPIXEL_OFFSETS.map(([dx, dy]) => {
    const subpixelX = x + dx;
    const subpixelY = y + dy;
    let closestTileIndex = tileIndex;
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
