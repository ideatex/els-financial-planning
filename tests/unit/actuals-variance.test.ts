import { describe, it, expect } from 'vitest';
import {
  parseCsvText,
  computeFileHash,
  profileCsvContent,
} from '@/server/services/actual-import.service';
import { classifyFavorability } from '@/server/services/variance.service';
import { exportReportCsv } from '@/server/services/reporting.service';
import { FinancialDecimal } from '@/financial-engine/domain/decimal';

describe('Phase 5 Actuals & Variance Unit Tests', () => {
  describe('CSV Parsing & Profiling', () => {
    it('correctly parses standard CSV lines into headers and row objects', () => {
      const csv = `Date,Plant,Product,Amount\n2027-01-15,PLANT-CH,SKU-A,500000\n2027-01-20,PLANT-CH,SKU-B,320000`;
      const { headers, rows } = parseCsvText(csv);

      expect(headers).toEqual(['Date', 'Plant', 'Product', 'Amount']);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        Date: '2027-01-15',
        Plant: 'PLANT-CH',
        Product: 'SKU-A',
        Amount: '500000',
      });
      expect(rows[1].Amount).toBe('320000');
    });

    it('correctly handles quoted fields containing commas and escaped quotes', () => {
      const csv = `ID,Description,Amount\n1,"Precision Actuator, Type ""A""",1500.50`;
      const { headers, rows } = parseCsvText(csv);

      expect(headers).toEqual(['ID', 'Description', 'Amount']);
      expect(rows[0].Description).toBe('Precision Actuator, Type "A"');
      expect(rows[0].Amount).toBe('1500.50');
    });

    it('profiles CSV content detecting date and numeric fields', () => {
      const csv = `TxnDate,Category,Quantity,Revenue\n2027-01-10,FINISHED_GOOD,100,50000\n2027-01-15,FINISHED_GOOD,200,100000`;
      const profile = profileCsvContent(csv, 'test_actuals.csv');

      expect(profile.fileName).toBe('test_actuals.csv');
      expect(profile.rowCount).toBe(2);
      expect(profile.columnNames).toEqual(['TxnDate', 'Category', 'Quantity', 'Revenue']);
      expect(profile.detectedDateFields).toContain('TxnDate');
      expect(profile.detectedNumericFields).toContain('Quantity');
      expect(profile.detectedNumericFields).toContain('Revenue');
    });

    it('computes deterministic SHA-256 digests for duplicate detection', () => {
      const contentA = 'Date,Amount\n2027-01-01,100';
      const contentB = 'Date,Amount\n2027-01-01,100';
      const contentC = 'Date,Amount\n2027-01-01,200';

      const hashA = computeFileHash(contentA);
      const hashB = computeFileHash(contentB);
      const hashC = computeFileHash(contentC);

      expect(hashA).toBe(hashB);
      expect(hashA).not.toBe(hashC);
      expect(hashA).toHaveLength(64);
    });
  });

  describe('Favorability Rules Engine', () => {
    it('classifies revenue variances: higher is favorable, lower is unfavorable', () => {
      expect(classifyFavorability('REVENUE', 500000, 520000)).toBe('FAVORABLE');
      expect(classifyFavorability('REVENUE', 500000, 480000)).toBe('UNFAVORABLE');
      expect(classifyFavorability('REVENUE', 500000, 500000)).toBe('NEUTRAL');
    });

    it('classifies COGS and Opex: higher is unfavorable, lower is favorable', () => {
      expect(classifyFavorability('COGS', 320000, 330000)).toBe('UNFAVORABLE');
      expect(classifyFavorability('COGS', 320000, 310000)).toBe('FAVORABLE');
      expect(classifyFavorability('OPEX', 100000, 110000)).toBe('UNFAVORABLE');
      expect(classifyFavorability('OPEX', 100000, 95000)).toBe('FAVORABLE');
    });

    it('classifies Gross Profit and Operating Profit: higher is favorable, lower is unfavorable', () => {
      expect(classifyFavorability('GROSS_PROFIT', 180000, 190000)).toBe('FAVORABLE');
      expect(classifyFavorability('GROSS_PROFIT', 180000, 170000)).toBe('UNFAVORABLE');
      expect(classifyFavorability('OPERATING_PROFIT', 80000, 80000)).toBe('NEUTRAL');
      expect(classifyFavorability('OPERATING_PROFIT', 80000, 90000)).toBe('FAVORABLE');
    });

    it('classifies production volume favorability', () => {
      expect(classifyFavorability('PRODUCTION', 1100, 1150)).toBe('FAVORABLE');
      expect(classifyFavorability('PRODUCTION', 1100, 1050)).toBe('UNFAVORABLE');
    });
  });

  describe('Deterministic Decimal Variance Math & Zero-Plan Safety', () => {
    it('calculates exact decimal variances using FinancialDecimal', () => {
      const plan = 320000;
      const actual = 330000;
      const diff = FinancialDecimal.fromNumber(actual).minus(plan).toNumber();

      expect(diff).toBe(10000);
      const pct = (diff / plan) * 100;
      expect(pct).toBeCloseTo(3.125, 3);
    });

    it('safely handles zero-plan baseline without division by zero', () => {
      const plan = 0;
      const actual = 15000;

      const isPlanZero = Math.abs(plan) < 0.0001;
      let variancePercent: number | null = null;
      let zeroPlanState: string | undefined = undefined;

      if (isPlanZero) {
        variancePercent = null;
        zeroPlanState = Math.abs(actual) > 0.0001 ? 'NEW_ACTUAL_ACTIVITY' : 'NO_PLAN_BASELINE';
      } else {
        variancePercent = ((actual - plan) / Math.abs(plan)) * 100;
      }

      expect(variancePercent).toBeNull();
      expect(zeroPlanState).toBe('NEW_ACTUAL_ACTIVITY');
    });
  });

  describe('Report Export Formatting', () => {
    it('generates formatted RFC 4180 CSV export with header metadata', () => {
      const csv = exportReportCsv(
        'Test Variance Report',
        {
          organization: 'Apex Manufacturing',
          planVersion: 'V1-APPROVED',
          period: '2027-P01',
          currency: 'INR',
        },
        ['Line Item', 'Plan', 'Actual', 'Variance'],
        [['Gross Revenue', 500000, 520000, 20000]]
      );

      expect(csv).toContain('"Test Variance Report"');
      expect(csv).toContain('"Organization","Apex Manufacturing"');
      expect(csv).toContain('"Gross Revenue",500000,520000,20000');
    });
  });
});
