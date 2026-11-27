'use strict';
function plattScale(probabilities, labels, { lr = 0.1, epochs = 2000 } = {}) {
  let a = 1, b = 0;
  for (let e = 0; e < epochs; e++) {
    let ga = 0, gb = 0;
    for (let i = 0; i < probabilities.length; i++) {
      const p = 1 / (1 + Math.exp(-(a * probabilities[i] + b)));
      const err = p - labels[i];
      ga += err * probabilities[i];
      gb += err;
    }
    a -= (lr / probabilities.length) * ga;
    b -= (lr / probabilities.length) * gb;
  }
  return probabilities.map((p) => 1 / (1 + Math.exp(-(a * p + b))));
}
module.exports = { plattScale };
