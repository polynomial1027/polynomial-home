const CHARACTER_MAX = 1260;
const WEAPON_MAX = 800;

export function characterFiveStarRate(nextPity) {
  if (nextPity >= 90) return 1;
  if (nextPity <= 73) return 0.006;
  return Math.min(1, 0.006 + (nextPity - 73) * 0.06);
}

export function weaponFiveStarRate(nextPity) {
  if (nextPity >= 80) return 1;
  if (nextPity <= 62) return 0.007;
  return Math.min(1, 0.007 + (nextPity - 62) * 0.0552);
}

// Community state model, back-solved so non-guaranteed promotional outcomes
// converge to HoYoverse's published 55% consolidated rate.
export const RADIANCE_PROMO_RATE = [0.5, 0.5, 8 / 11, 1];

function add(map, key, value) {
  if (value <= 0) return;
  map.set(key, (map.get(key) || 0) + value);
}

function normalizedPmf(cdf) {
  const pmf = new Float64Array(cdf.length);
  pmf[0] = cdf[0];
  for (let i = 1; i < cdf.length; i += 1)
    pmf[i] = Math.max(0, cdf[i] - cdf[i - 1]);
  return pmf;
}

export function characterDistribution({
  copies,
  pity = 0,
  guaranteed = false,
  radianceStreak = 0,
}) {
  const target = Math.max(0, Math.min(7, Number(copies) || 0));
  const cdf = new Float64Array(CHARACTER_MAX + 1);
  if (target === 0) {
    cdf.fill(1);
    return { cdf, pmf: normalizedPmf(cdf) };
  }

  let states = new Map([
    [`${pity}|${guaranteed ? 1 : 0}|${radianceStreak}|0`, 1],
  ]);
  let success = 0;
  for (let pull = 1; pull <= CHARACTER_MAX; pull += 1) {
    const next = new Map();
    for (const [key, mass] of states) {
      const [currentPity, isGuaranteed, streak, owned] = key
        .split("|")
        .map(Number);
      const rate = characterFiveStarRate(currentPity + 1);
      add(
        next,
        `${currentPity + 1}|${isGuaranteed}|${streak}|${owned}`,
        mass * (1 - rate),
      );

      if (isGuaranteed) {
        if (owned + 1 >= target) success += mass * rate;
        else add(next, `0|0|${streak}|${owned + 1}`, mass * rate);
      } else {
        const promoRate = RADIANCE_PROMO_RATE[Math.min(3, streak)];
        const promoMass = mass * rate * promoRate;
        const missMass = mass * rate * (1 - promoRate);
        if (owned + 1 >= target) success += promoMass;
        else add(next, `0|0|0|${owned + 1}`, promoMass);
        add(next, `0|1|${Math.min(3, streak + 1)}|${owned}`, missMass);
      }
    }
    states = next;
    cdf[pull] = Math.min(1, success);
    if (success > 1 - 1e-14) {
      for (let rest = pull + 1; rest < cdf.length; rest += 1) cdf[rest] = 1;
      break;
    }
  }
  return { cdf, pmf: normalizedPmf(cdf) };
}

export function weaponDistribution({
  copies,
  pity = 0,
  featuredGuaranteed = false,
  fatePoint = 0,
}) {
  const target = Math.max(0, Math.min(5, Number(copies) || 0));
  const cdf = new Float64Array(WEAPON_MAX + 1);
  if (target === 0) {
    cdf.fill(1);
    return { cdf, pmf: normalizedPmf(cdf) };
  }

  let states = new Map([
    [`${pity}|${featuredGuaranteed ? 1 : 0}|${fatePoint ? 1 : 0}|0`, 1],
  ]);
  let success = 0;
  for (let pull = 1; pull <= WEAPON_MAX; pull += 1) {
    const next = new Map();
    for (const [key, mass] of states) {
      const [currentPity, isFeaturedGuaranteed, fate, owned] = key
        .split("|")
        .map(Number);
      const rate = weaponFiveStarRate(currentPity + 1);
      add(
        next,
        `${currentPity + 1}|${isFeaturedGuaranteed}|${fate}|${owned}`,
        mass * (1 - rate),
      );

      if (fate) {
        if (owned + 1 >= target) success += mass * rate;
        else add(next, `0|0|0|${owned + 1}`, mass * rate);
        continue;
      }

      const targetRate = isFeaturedGuaranteed ? 0.5 : 0.375;
      const otherFeaturedRate = isFeaturedGuaranteed ? 0.5 : 0.375;
      const standardRate = isFeaturedGuaranteed ? 0 : 0.25;
      const targetMass = mass * rate * targetRate;
      if (owned + 1 >= target) success += targetMass;
      else add(next, `0|0|0|${owned + 1}`, targetMass);
      add(next, `0|0|1|${owned}`, mass * rate * otherFeaturedRate);
      add(next, `0|1|1|${owned}`, mass * rate * standardRate);
    }
    states = next;
    cdf[pull] = Math.min(1, success);
    if (success > 1 - 1e-14) {
      for (let rest = pull + 1; rest < cdf.length; rest += 1) cdf[rest] = 1;
      break;
    }
  }
  return { cdf, pmf: normalizedPmf(cdf) };
}

export function combineSequential(first, second) {
  const length = first.pmf.length + second.pmf.length - 1;
  const pmf = new Float64Array(length);
  for (let i = 0; i < first.pmf.length; i += 1) {
    if (first.pmf[i] === 0) continue;
    for (let j = 0; j < second.pmf.length; j += 1) {
      if (second.pmf[j] !== 0) pmf[i + j] += first.pmf[i] * second.pmf[j];
    }
  }
  const cdf = new Float64Array(length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += pmf[i];
    cdf[i] = Math.min(1, sum);
  }
  return { cdf, pmf };
}

export function calculatePlan(config) {
  const character = characterDistribution(config.character);
  const weapon = weaponDistribution(config.weapon);
  return combineSequential(character, weapon);
}

export function percentile(cdf, probability) {
  for (let i = 0; i < cdf.length; i += 1)
    if (cdf[i] + 1e-12 >= probability) return i;
  return null;
}

export function probabilityAt(cdf, pulls) {
  const index = Math.max(
    0,
    Math.min(cdf.length - 1, Math.floor(Number(pulls) || 0)),
  );
  return cdf[index];
}

export function marginalAt(pmf, pulls) {
  const index = Math.max(
    0,
    Math.min(pmf.length - 1, Math.floor(Number(pulls) || 0)),
  );
  return pmf[index];
}
