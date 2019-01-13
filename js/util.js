export function extractUrlParams() {
  return location.search.split(/[?&]/).filter(e => e).reduce((map, e) => {
    const [k, v] = e.split('=');
    map[k] = v;
    return map;
  }, {});
}

export function rand(n) {
  return Math.floor(Math.random() * n);
}
