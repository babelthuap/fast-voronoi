export function averageSubpixels(subpixels, tiles) {
  const colorSum = new Array(3).fill(0);
  subpixels.forEach(closestTileIndex => {
    const color = tiles[closestTileIndex].color;
    colorSum[0] += color[0];
    colorSum[1] += color[1];
    colorSum[2] += color[2];
  });
  return colorSum.map(c => c / subpixels.length);
}

export function euclideanDist(x1, y1, x2, y2) {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
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
