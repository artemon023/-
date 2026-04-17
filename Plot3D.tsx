/**
 * Peng-Robinson Equation of State Solver
 */

export interface PRParams {
  a: number;
  b: number;
  R: number;
  T: number;
}

export interface PRResult {
  Z_liquid: number | null;
  Z_vapor: number | null;
  Z_middle: number | null;
  all_roots: number[];
  A: number;
  B: number;
}

/**
 * Solves the cubic equation: x^3 + ax^2 + bx + c = 0
 * Returns real roots.
 */
export function solveCubic(a: number, b: number, c: number): number[] {
  const Q = (a * a - 3 * b) / 9;
  const R = (2 * a * a * a - 9 * a * b + 27 * c) / 54;
  const R2 = R * R;
  const Q3 = Q * Q * Q;

  if (R2 < Q3) {
    const theta = Math.acos(R / Math.sqrt(Q3));
    const sqrtQ = Math.sqrt(Q);
    const r1 = -2 * sqrtQ * Math.cos(theta / 3) - a / 3;
    const r2 = -2 * sqrtQ * Math.cos((theta + 2 * Math.PI) / 3) - a / 3;
    const r3 = -2 * sqrtQ * Math.cos((theta - 2 * Math.PI) / 3) - a / 3;
    return [r1, r2, r3].sort((x, y) => x - y);
  } else {
    const A = -Math.sign(R) * Math.pow(Math.abs(R) + Math.sqrt(R2 - Q3), 1 / 3);
    const B = A === 0 ? 0 : Q / A;
    const r1 = (A + B) - a / 3;
    return [r1];
  }
}

export function calculatePRRoots(P: number, params: PRParams): PRResult {
  const { a, b, R, T } = params;
  const A = (a * P) / (Math.pow(R * T, 2));
  const B = (b * P) / (R * T);

  // Z^3 + a2*Z^2 + a1*Z + a0 = 0
  const a2 = -(1 - B);
  const a1 = A - 3 * Math.pow(B, 2) - 2 * B;
  const a0 = -(A * B - Math.pow(B, 2) - Math.pow(B, 3));

  const roots = solveCubic(a2, a1, a0).filter(r => r > 0);

  if (roots.length === 3) {
    return {
      Z_liquid: roots[0],
      Z_middle: roots[1],
      Z_vapor: roots[2],
      all_roots: roots,
      A, B
    };
  } else if (roots.length === 1) {
    const z = roots[0];
    // For PR EOS, Z_c is approximately 0.3074. 
    // If Z is smaller than this, it's a compressed liquid or dense supercritical fluid.
    if (z < 0.3074) {
      return {
        Z_liquid: z,
        Z_middle: null,
        Z_vapor: null,
        all_roots: roots,
        A, B
      };
    } else {
      return {
        Z_liquid: null,
        Z_middle: null,
        Z_vapor: z,
        all_roots: roots,
        A, B
      };
    }
  }

  return {
    Z_liquid: null,
    Z_vapor: null,
    Z_middle: null,
    all_roots: roots,
    A, B
  };
}

export function getLnPhi(Z: number, A: number, B: number): number {
  const s2 = Math.SQRT2;
  return Z - 1 - Math.log(Z - B) - (A / (2 * s2 * B)) * Math.log((Z + (1 + s2) * B) / (Z + (1 - s2) * B));
}

export const SUBSTANCES = {
  Methane: { Tc: 190.56, Pc: 45.99, omega: 0.011, Mw: 16.04 },
  Ethane: { Tc: 305.32, Pc: 48.72, omega: 0.099, Mw: 30.07 },
  Ethylene: { Tc: 282.34, Pc: 49.76, omega: 0.087, Mw: 28.05 },
  Propane: { Tc: 369.83, Pc: 42.48, omega: 0.152, Mw: 44.10 },
  Butane: { Tc: 425.12, Pc: 37.96, omega: 0.200, Mw: 58.12 },
  Pentane: { Tc: 469.7, Pc: 33.3, omega: 0.252, Mw: 72.15 },
  Hexane: { Tc: 507.6, Pc: 29.7, omega: 0.301, Mw: 86.18 },
  Heptane: { Tc: 540.2, Pc: 27.0, omega: 0.350, Mw: 100.2 },
  Octane: { Tc: 568.7, Pc: 24.5, omega: 0.400, Mw: 114.2 },
  Nonane: { Tc: 594.6, Pc: 22.8, omega: 0.444, Mw: 128.3 },
  Decane: { Tc: 617.7, Pc: 21.1, omega: 0.492, Mw: 142.3 },
  CO2: { Tc: 304.13, Pc: 73.75, omega: 0.224, Mw: 44.01 },
  H2S: { Tc: 373.5, Pc: 88.48, omega: 0.094, Mw: 34.08 },
  Nitrogen: { Tc: 126.19, Pc: 33.98, omega: 0.037, Mw: 28.01 },
};

export const KIJ: Record<string, Record<string, number>> = {
  Nitrogen: { Methane: 0.031, Ethylene: 0.060, Ethane: 0.060, Propane: 0.085, Butane: 0.080, CO2: -0.020 },
  Methane: { Ethylene: 0.010, Ethane: 0.000, Propane: 0.014, Butane: 0.025, CO2: 0.105 },
  CO2: { Ethane: 0.130, Butane: 0.130 },
  Ethane: { Propane: 0.000, Butane: 0.010 },
  Propane: { Butane: 0.000 }
};

function getKij(id1: string, id2: string): number {
  if (KIJ[id1] && KIJ[id1][id2] !== undefined) return KIJ[id1][id2];
  if (KIJ[id2] && KIJ[id2][id1] !== undefined) return KIJ[id2][id1];
  return 0.0;
}

export function getAlpha(T: number, Tc: number, omega: number): number {
  const Tr = T / Tc;
  const kappa = 0.37464 + 1.54226 * omega - 0.26992 * omega * omega;
  return Math.pow(1 + kappa * (1 - Math.sqrt(Tr)), 2);
}

export function getAB(T: number, Tc: number, Pc: number, omega: number, R: number = 0.08206): { a: number, b: number } {
  const alpha = getAlpha(T, Tc, omega);
  const a = 0.45724 * (R * R * Tc * Tc) / Pc * alpha;
  const b = 0.07780 * (R * Tc) / Pc;
  return { a, b };
}

export function getMixtureAB(
  composition: { id: keyof typeof SUBSTANCES; x: number }[],
  T: number,
  R: number = 0.08206
): { a: number, b: number } {
  const totalX = composition.reduce((sum, comp) => sum + comp.x, 0) || 1;
  const fractions = composition.map(c => c.x / totalX);
  
  let b_mix = 0;
  const a_pure = composition.map(comp => {
    const sub = SUBSTANCES[comp.id];
    const { a, b } = getAB(T, sub.Tc, sub.Pc, sub.omega, R);
    return { a, b };
  });

  for (let i = 0; i < composition.length; i++) {
    b_mix += fractions[i] * a_pure[i].b;
  }

  let a_mix = 0;
  for (let i = 0; i < composition.length; i++) {
    for (let j = 0; j < composition.length; j++) {
      const kij = getKij(composition[i].id, composition[j].id);
      a_mix += fractions[i] * fractions[j] * Math.sqrt(a_pure[i].a * a_pure[j].a) * (1 - kij);
    }
  }

  return { a: a_mix, b: b_mix };
}
