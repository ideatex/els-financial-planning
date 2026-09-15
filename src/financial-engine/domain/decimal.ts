/**
 * Deterministic Financial Decimal Utility
 * Fixed-point arithmetic using 6 decimal places internal scale (BigInt)
 * Eliminates IEEE-754 floating point inaccuracies in manufacturing FP&A calculations.
 */

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'TRUNCATE';

export class FinancialDecimal {
  private static readonly SCALE_DECIMALS = 6;
  public static readonly SCALE = 1_000_000n; // 10^6
  public static readonly ZERO = new FinancialDecimal(0n);
  public static readonly ONE = new FinancialDecimal(FinancialDecimal.SCALE);
  public static readonly HUNDRED = new FinancialDecimal(100n * FinancialDecimal.SCALE);

  private readonly value: bigint;

  constructor(scaledValue: bigint) {
    this.value = scaledValue;
  }

  public static from(val: number | string | bigint | FinancialDecimal): FinancialDecimal {
    if (val instanceof FinancialDecimal) {
      return val;
    }
    if (typeof val === 'bigint') {
      return new FinancialDecimal(val * FinancialDecimal.SCALE);
    }
    if (typeof val === 'string') {
      const parsed = parseFloat(val.trim().replace(/,/g, ''));
      if (isNaN(parsed)) {
        throw new Error(`Invalid numeric string for FinancialDecimal: "${val}"`);
      }
      return FinancialDecimal.fromNumber(parsed);
    }
    if (typeof val === 'number') {
      return FinancialDecimal.fromNumber(val);
    }
    throw new Error(`Cannot convert ${typeof val} to FinancialDecimal`);
  }

  public static fromNumber(val: number): FinancialDecimal {
    if (!isFinite(val)) {
      throw new Error(`Cannot construct FinancialDecimal from non-finite number: ${val}`);
    }
    // Round to 6 decimal places to prevent float drift during initial scaling
    const scaled = Math.round(val * Number(FinancialDecimal.SCALE));
    return new FinancialDecimal(BigInt(scaled));
  }

  public plus(other: number | string | FinancialDecimal): FinancialDecimal {
    const o = FinancialDecimal.from(other);
    return new FinancialDecimal(this.value + o.value);
  }

  public minus(other: number | string | FinancialDecimal): FinancialDecimal {
    const o = FinancialDecimal.from(other);
    return new FinancialDecimal(this.value - o.value);
  }

  public times(other: number | string | FinancialDecimal): FinancialDecimal {
    const o = FinancialDecimal.from(other);
    // (A * B) / SCALE
    const product = this.value * o.value;
    const sign = product < 0n ? -1n : 1n;
    const absProduct = product < 0n ? -product : product;
    // Add half scale for HALF_UP rounding at scale boundary
    const rounded = (absProduct + FinancialDecimal.SCALE / 2n) / FinancialDecimal.SCALE;
    return new FinancialDecimal(sign * rounded);
  }

  public dividedBy(other: number | string | FinancialDecimal): FinancialDecimal {
    const o = FinancialDecimal.from(other);
    if (o.value === 0n) {
      throw new Error('FinancialDecimal division by zero');
    }
    // (A * SCALE) / B
    const numerator = this.value * FinancialDecimal.SCALE;
    const sign = (numerator < 0n && o.value > 0n) || (numerator > 0n && o.value < 0n) ? -1n : 1n;
    const absNum = numerator < 0n ? -numerator : numerator;
    const absDen = o.value < 0n ? -o.value : o.value;
    // Add half denominator for HALF_UP rounding
    const quotient = (absNum + absDen / 2n) / absDen;
    return new FinancialDecimal(sign * quotient);
  }

  public abs(): FinancialDecimal {
    return this.value < 0n ? new FinancialDecimal(-this.value) : this;
  }

  public negate(): FinancialDecimal {
    return new FinancialDecimal(-this.value);
  }

  public isZero(): boolean {
    return this.value === 0n;
  }

  public isPositive(): boolean {
    return this.value > 0n;
  }

  public isNegative(): boolean {
    return this.value < 0n;
  }

  public equals(other: number | string | FinancialDecimal): boolean {
    const o = FinancialDecimal.from(other);
    return this.value === o.value;
  }

  public greaterThan(other: number | string | FinancialDecimal): boolean {
    const o = FinancialDecimal.from(other);
    return this.value > o.value;
  }

  public greaterThanOrEqual(other: number | string | FinancialDecimal): boolean {
    const o = FinancialDecimal.from(other);
    return this.value >= o.value;
  }

  public lessThan(other: number | string | FinancialDecimal): boolean {
    const o = FinancialDecimal.from(other);
    return this.value < o.value;
  }

  public lessThanOrEqual(other: number | string | FinancialDecimal): boolean {
    const o = FinancialDecimal.from(other);
    return this.value <= o.value;
  }

  /**
   * Rounds to specified decimal places with given RoundingMode (default: HALF_UP)
   */
  public toDecimalPlaces(decimals: number, mode: RoundingMode = 'HALF_UP'): number {
    if (decimals < 0 || decimals > 6) {
      throw new Error(`Decimals must be between 0 and 6, got ${decimals}`);
    }

    const factor = 10n ** BigInt(6 - decimals);
    if (factor === 1n) {
      return Number(this.value) / Number(FinancialDecimal.SCALE);
    }

    const sign = this.value < 0n ? -1n : 1n;
    const absVal = this.value < 0n ? -this.value : this.value;

    let rounded: bigint;
    if (mode === 'TRUNCATE') {
      rounded = absVal / factor;
    } else if (mode === 'HALF_EVEN') {
      const quotient = absVal / factor;
      const remainder = absVal % factor;
      const half = factor / 2n;
      if (remainder > half || (remainder === half && quotient % 2n !== 0n)) {
        rounded = quotient + 1n;
      } else {
        rounded = quotient;
      }
    } else {
      // HALF_UP
      rounded = (absVal + factor / 2n) / factor;
    }

    const resultScaled = sign * rounded;
    return Number(resultScaled) / 10 ** decimals;
  }

  public toNumber(): number {
    return Number(this.value) / Number(FinancialDecimal.SCALE);
  }

  public toFixed(decimals = 2): string {
    return this.toDecimalPlaces(decimals).toFixed(decimals);
  }

  public toString(): string {
    return this.toFixed(2);
  }
}

export function dec(val: number | string | bigint | FinancialDecimal): FinancialDecimal {
  return FinancialDecimal.from(val);
}
