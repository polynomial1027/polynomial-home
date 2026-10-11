// Discrete derivatives of the completion-time CDF. No probability target.
export function analyzeCurve(cdf, costWeight = 1) {
  const derivative = Array.from(cdf, (p, n) =>
    n ? Math.max(0, p - cdf[n - 1]) : 0,
  );
  const second = derivative.map((gain, n) =>
    n ? gain - derivative[n - 1] : 0,
  );
  const peaks = [];
  for (let n = 1; n < derivative.length; n++) {
    if (derivative[n] <= 1e-12 || derivative[n] <= derivative[n - 1] + 1e-12)
      continue;
    let end = n;
    while (
      end + 1 < derivative.length &&
      Math.abs(derivative[end + 1] - derivative[n]) <= 1e-12
    )
      end++;
    if (
      end + 1 === derivative.length ||
      derivative[end + 1] < derivative[n] - 1e-12
    ) {
      peaks.push({ pulls: n, probability: cdf[n], gain: derivative[n] });
    }
    n = end;
  }
  // Numerical support endpoint of this finite distribution; not an official hard cap.
  let horizon = 0;
  for (let n = 1; n < derivative.length; n++)
    if (derivative[n] > 0) horizon = n;
  let recommended = 0,
    bestScore = -Infinity;
  // Weighted geometric compromise: completion gain × remaining budget fraction^weight.
  // Evaluate actionable budgets only. Zero pulls is reserved for already-complete goals.
  // Ties prefer fewer pulls, including a distribution guaranteed in exactly one pull.
  const normalizedWeight = Math.max(0, Number(costWeight) || 0);
  if (horizon)
    for (let n = 1; n <= horizon; n++) {
      if (cdf[n] <= cdf[0]) continue;
      const score =
        (cdf[n] - cdf[0]) * Math.pow(1 - n / horizon, normalizedWeight);
      if (score > bestScore + 1e-12) {
        bestScore = score;
        recommended = n;
      }
    }
  return {
    derivative,
    second,
    peaks,
    horizon,
    recommended,
    score: horizon ? bestScore : 0,
    costWeight,
  };
}
