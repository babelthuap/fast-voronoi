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
