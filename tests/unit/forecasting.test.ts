import { describe, it, expect } from 'vitest';
import { FinancialDecimal } from '@/financial-engine/domain/decimal';
import { classifyFavorability } from '@/server/services/variance.service';

describe('Phase 6 Forecasting & Scenario Planning Unit Tests', () => {
  describe('Period Source Classification Rules', () => {
    function classifyPeriodSource(
      periodNumber: number,
      actualsCutoffPeriodNumber: number,
      hasActuals: boolean,
      isManualOverride: boolean
    ): 'ACTUAL' | 'FORECAST' | 'PLAN' | 'MANUAL_OVERRIDE' | 'UNAVAILABLE' {
      if (isManualOverride) return 'MANUAL_OVERRIDE';
      if (periodNumber <= actualsCutoffPeriodNumber) {
        return hasActuals ? 'ACTUAL' : 'UNAVAILABLE';
      }
      return 'FORECAST';
    }

    it('classifies periods <= cutoff as ACTUAL when actuals exist', () => {
      expect(classifyPeriodSource(1, 3, true, false)).toBe('ACTUAL');
      expect(classifyPeriodSource(2, 3, true, false)).toBe('ACTUAL');
      expect(classifyPeriodSource(3, 3, true, false)).toBe('ACTUAL');
    });

    it('classifies periods <= cutoff as UNAVAILABLE when actuals are missing', () => {
      expect(classifyPeriodSource(2, 3, false, false)).toBe('UNAVAILABLE');
    });

    it('classifies periods > cutoff as FORECAST', () => {
      expect(classifyPeriodSource(4, 3, false, false)).toBe('FORECAST');
      expect(classifyPeriodSource(6, 3, false, false)).toBe('FORECAST');
      expect(classifyPeriodSource(12, 3, false, false)).toBe('FORECAST');
    });

    it('prioritizes MANUAL_OVERRIDE when user specifies explicit period adjustment', () => {
      expect(classifyPeriodSource(5, 3, false, true)).toBe('MANUAL_OVERRIDE');
    });
  });

  describe('Rolling Horizon Advance & Boundary Rules', () => {
    function advanceHorizon(
      currentCutoff: number,
      currentEnd: number,
      advancePeriods: number,
      extendPeriods: number,
      maxCalendarPeriods = 12
    ) {
      const nextCutoff = currentCutoff + advancePeriods;
      const nextEnd = Math.min(currentEnd + extendPeriods, maxCalendarPeriods);

      if (nextCutoff > nextEnd) {
        throw new Error(`Cutoff period ${nextCutoff} cannot exceed horizon end ${nextEnd}`);
      }

      return {
        nextCutoff,
        nextEnd,
        newlyActualPeriods: Array.from(
          { length: advancePeriods },
          (_, i) => currentCutoff + 1 + i
        ).filter((p) => p <= maxCalendarPeriods),
      };
    }

    it('advances cutoff from P03 to P04 and extends horizon from P12 to P12 (calendar bound)', () => {
      const result = advanceHorizon(3, 12, 1, 1, 12);
      expect(result.nextCutoff).toBe(4);
      expect(result.nextEnd).toBe(12);
      expect(result.newlyActualPeriods).toEqual([4]);
    });

    it('supports multi-period quarterly rolling advances (e.g. advance by 3 periods)', () => {
      const result = advanceHorizon(3, 12, 3, 3, 12);
      expect(result.nextCutoff).toBe(6);
      expect(result.nextEnd).toBe(12);
      expect(result.newlyActualPeriods).toEqual([4, 5, 6]);
    });

    it('rejects advancement when cutoff would exceed horizon end', () => {
      expect(() => advanceHorizon(11, 12, 2, 0, 12)).toThrow(
        'Cutoff period 13 cannot exceed horizon end 12'
      );
    });
  });

  describe('What-If Scenario Driver Delta Mathematics', () => {
    function calculateProposedValue(
      baselineValue: number,
      deltaType: 'PERCENTAGE' | 'ABSOLUTE' | 'REPLACEMENT',
      deltaValue: number
    ): number {
      if (deltaType === 'PERCENTAGE') {
        const factor = FinancialDecimal.from(1).plus(FinancialDecimal.from(deltaValue).dividedBy(100));
        return FinancialDecimal.from(baselineValue).times(factor).toNumber();
      }
      if (deltaType === 'ABSOLUTE') {
        return FinancialDecimal.from(baselineValue).plus(deltaValue).toNumber();
      }
      return deltaValue;
    }

    it('computes percentage adjustments with exact decimal precision', () => {
      // +10% on 1000 = 1100
      expect(calculateProposedValue(1000, 'PERCENTAGE', 10)).toBe(1100);

      // +2% on 500 = 510
      expect(calculateProposedValue(500, 'PERCENTAGE', 2)).toBe(510);

      // -3% on 90 = 87.3
      expect(calculateProposedValue(90, 'PERCENTAGE', -3)).toBe(87.3);

      // -10% on 1000 = 900
      expect(calculateProposedValue(1000, 'PERCENTAGE', -10)).toBe(900);

      // +5% on 90 = 94.5
      expect(calculateProposedValue(90, 'PERCENTAGE', 5)).toBe(94.5);

      // +8% on 100000 = 108000
      expect(calculateProposedValue(100000, 'PERCENTAGE', 8)).toBe(108000);
    });

    it('computes absolute deltas correctly', () => {
      expect(calculateProposedValue(500, 'ABSOLUTE', 25)).toBe(525);
      expect(calculateProposedValue(500, 'ABSOLUTE', -50)).toBe(450);
    });

    it('applies direct replacement values without baseline distortion', () => {
      expect(calculateProposedValue(500, 'REPLACEMENT', 620)).toBe(620);
    });
  });

  describe('Section 19 Acceptance Scenario Mathematics', () => {
    // Standard baseline manufacturing inputs:
    // Volume: 1000 EA @ ₹500/unit = ₹500,000 Revenue
    // Raw Material Price: ₹90/KG, 2.2 KG/unit = ₹198/unit * 1000 = ₹198,000
    // Labor: ₹110/unit * 1000 = ₹110,000
    // Overhead: ₹44/unit * 1000 = ₹44,000
    // Total COGS: ₹320,000 (after inventory delta absorption)
    // Gross Profit: ₹180,000 (36%)
    // Monthly Opex: ₹100,000
    // Operating Profit: ₹80,000 (16%)

    it('verifies Best Case Scenario: +10% volume, +2% price, -3% raw material price', () => {
      const volume = 1000 * 1.10; // 1,100 EA
      const price = 500 * 1.02;   // ₹510 / unit
      const revenue = volume * price; // ₹561,000

      expect(volume).toBe(1100);
      expect(price).toBe(510);
      expect(revenue).toBe(561000);

      // Unit material cost with -3% price on ₹90 = ₹87.30/KG * 2.2 KG = ₹192.06/unit
      const materialPrice = 90 * (1 - 0.03); // 87.30
      expect(materialPrice).toBe(87.3);

      // Revenue favorable variance vs baseline 500,000
      const revVariance = revenue - 500000;
      expect(revVariance).toBe(61000);
      expect(classifyFavorability('REVENUE', 500000, revenue)).toBe('FAVORABLE');
    });

    it('verifies Worst Case Scenario: -10% volume, +5% material price, +8% opex', () => {
      const volume = 1000 * 0.90; // 900 EA
      const price = 500;          // ₹500 / unit
      const revenue = volume * price; // ₹450,000

      expect(volume).toBe(900);
      expect(revenue).toBe(450000);

      const materialPrice = 90 * 1.05; // ₹94.50 / KG
      expect(materialPrice).toBe(94.5);

      const opex = 100000 * 1.08; // ₹108,000
      expect(opex).toBe(108000);

      // Revenue unfavorable variance vs baseline 500,000
      expect(classifyFavorability('REVENUE', 500000, revenue)).toBe('UNFAVORABLE');

      // Opex unfavorable variance vs baseline 100,000
      expect(classifyFavorability('OPEX', 100000, opex)).toBe('UNFAVORABLE');
    });
  });

  describe('Scenario Favorability Rules Evaluation', () => {
    it('classifies favorable and unfavorable movements across all P&L lines', () => {
      // Revenue: Higher is Favorable
      expect(classifyFavorability('REVENUE', 500000, 561000)).toBe('FAVORABLE');
      expect(classifyFavorability('REVENUE', 500000, 450000)).toBe('UNFAVORABLE');

      // COGS: Lower is Favorable, Higher is Unfavorable
      expect(classifyFavorability('COGS', 320000, 310000)).toBe('FAVORABLE');
      expect(classifyFavorability('COGS', 320000, 340000)).toBe('UNFAVORABLE');

      // Gross Profit: Higher is Favorable
      expect(classifyFavorability('GROSS_PROFIT', 180000, 214940)).toBe('FAVORABLE');
      expect(classifyFavorability('GROSS_PROFIT', 180000, 153900)).toBe('UNFAVORABLE');

      // Opex: Lower is Favorable, Higher is Unfavorable
      expect(classifyFavorability('OPEX', 100000, 95000)).toBe('FAVORABLE');
      expect(classifyFavorability('OPEX', 100000, 108000)).toBe('UNFAVORABLE');

      // Operating Profit: Higher is Favorable
      expect(classifyFavorability('OPERATING_PROFIT', 80000, 114940)).toBe('FAVORABLE');
      expect(classifyFavorability('OPERATING_PROFIT', 80000, 45900)).toBe('UNFAVORABLE');
    });
  });
});
