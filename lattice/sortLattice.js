const {PI, atan, sign} = Math;

// (x, y) => (r^2, θ) where θ ∈ [0, 2 * PI)
function toPolar(x, y) {
  const r = x * x + y * y;
  switch (sign(x)) {
    case 0:
      // y-axis
      return {r, theta: y > 0 ? PI / 2 : 3 * PI / 2};
    case -1:
      // quadrants 2 and 3
      return {r, theta: PI + atan(y / x)};
    case 1:
      // quadrants 1 and 4
      return {r, theta: (2 * PI + atan(y / x)) % (2 * PI)};
  }
}

// Sorts a lattice of points by their distance from the origin, breaking ties
// by comparing polar angles.
function sortLattice(radius) {
  const points = new Array((2 * radius + 1) ** 2);
  for (let i = 0, x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      points[i++] = {rect: [x, y], polar: toPolar(x, y)};
    }
  }
  return points
      .filter(point => point.polar.r <= radius * radius)
      .sort((A, B) => {
        return A.polar.r === B.polar.r ?
            A.polar.theta - B.polar.theta :
            A.polar.r - B.polar.r;
      })
      .map(point => point.rect);
}

const start = Date.now();
const sorted = sortLattice(127);
console.log(`${Date.now() - start}ms`);

// Node - write to file
const fs = require('fs');
const flattened = new Array(sorted.length * 2);
for (let i = 0; i < sorted.length; i++) {
  flattened[2 * i] = sorted[i][0];
  flattened[2 * i + 1] = sorted[i][1];
}
const data = new Int8Array(flattened);
fs.writeFile('sorted', data, (err) => {
  if (err) throw err;
  console.log('saved');
});
