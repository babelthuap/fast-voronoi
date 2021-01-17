const {PI, atan, sign} = Math;

export function averageSubpixels(subpixels, tiles) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < subpixels.length; i++) {
    const color = tiles[subpixels[i]].color;
    r += color[0];
    g += color[1];
    b += color[2];
  }
  const average = new Uint8ClampedArray(3);
  average[0] = r / subpixels.length;
  average[1] = g / subpixels.length;
  average[2] = b / subpixels.length;
  return average;
}

export function euclideanDist(x1, y1, x2, y2) {
  const x = x1 - x2;
  const y = y1 - y2;
  return x * x + y * y;
}

export function extractUrlParams() {
  return location.search.split(/[?&]/).filter(e => e).reduce((map, e) => {
    const [k, v] = e.split('=');
    map[k] = v;
    return map;
  }, {});
}

export function pair(x, y) {
  return (x << 15) | y;
}

export function rand(n) {
  return Math.floor(Math.random() * n);
}
