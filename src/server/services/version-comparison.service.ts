import { db } from '@/lib/db';
import { NotFoundError } from '@/core/errors/AppError';

export interface DiffItem {
  id: string;
  category: string;
  dimension: string;
  metricOrCode: string;
  sourceValue: string | number | null;
  targetValue: string | number | null;
  unit?: string | null;
  changeType: 'ADDED' | 'REMOVED' | 'CHANGED' | 'UNCHANGED';
  delta?: number | null;
}

export async function compareVersions(
  orgId: string,
  sourceVersionId: string,
  targetVersionId: string,
  categoryFilter?: string
) {
  const source = await db.planVersion.findFirst({
    where: { id: sourceVersionId, organizationId: orgId },
    include: { planningCycle: true },
  });
  if (!source) throw new NotFoundError(`Source version '${sourceVersionId}' not found`);

  const target = await db.planVersion.findFirst({
    where: { id: targetVersionId, organizationId: orgId },
    include: { planningCycle: true },
  });
  if (!target) throw new NotFoundError(`Target version '${targetVersionId}' not found`);

  const diffs: DiffItem[] = [];

  // 1. Compare Management Targets
  if (!categoryFilter || categoryFilter === 'ALL' || categoryFilter === 'TARGETS') {
    const srcTargets = await db.managementTarget.findMany({
      where: { organizationId: orgId, planVersionId: sourceVersionId },
      include: { fiscalPeriod: true, plant: true, product: true },
    });
    const tgtTargets = await db.managementTarget.findMany({
      where: { organizationId: orgId, planVersionId: targetVersionId },
      include: { fiscalPeriod: true, plant: true, product: true },
    });

    const srcMap = new Map<string, typeof srcTargets[0]>();
    for (const t of srcTargets) {
      const key = `${t.fiscalPeriod.periodNumber}-${t.targetMetric}-${t.plantId || 'ALL'}-${t.productId || 'ALL'}`;
      srcMap.set(key, t);
    }

    const tgtMap = new Map<string, typeof tgtTargets[0]>();
    for (const t of tgtTargets) {
      const key = `${t.fiscalPeriod.periodNumber}-${t.targetMetric}-${t.plantId || 'ALL'}-${t.productId || 'ALL'}`;
      tgtMap.set(key, t);

      const src = srcMap.get(key);
      if (!src) {
        diffs.push({
          id: `tgt-${t.id}`,
          category: 'TARGETS',
          dimension: `${t.fiscalPeriod.periodName} • ${t.plant?.code || 'All Plants'} • ${t.product?.code || 'All Products'}`,
          metricOrCode: t.targetMetric,
          sourceValue: null,
          targetValue: t.targetValue,
          unit: t.unitOfMeasure,
          changeType: 'ADDED',
          delta: null,
        });
      } else if (src.targetValue !== t.targetValue) {
        diffs.push({
          id: `tgt-${t.id}`,
          category: 'TARGETS',
          dimension: `${t.fiscalPeriod.periodName} • ${t.plant?.code || 'All Plants'} • ${t.product?.code || 'All Products'}`,
          metricOrCode: t.targetMetric,
          sourceValue: src.targetValue,
          targetValue: t.targetValue,
          unit: t.unitOfMeasure,
          changeType: 'CHANGED',
          delta: t.targetValue - src.targetValue,
        });
      } else {
        diffs.push({
          id: `tgt-${t.id}`,
          category: 'TARGETS',
          dimension: `${t.fiscalPeriod.periodName} • ${t.plant?.code || 'All Plants'} • ${t.product?.code || 'All Products'}`,
          metricOrCode: t.targetMetric,
          sourceValue: src.targetValue,
          targetValue: t.targetValue,
          unit: t.unitOfMeasure,
          changeType: 'UNCHANGED',
          delta: 0,
        });
      }
    }

    for (const [key, src] of srcMap.entries()) {
      if (!tgtMap.has(key)) {
        diffs.push({
          id: `tgt-rm-${src.id}`,
          category: 'TARGETS',
          dimension: `${src.fiscalPeriod.periodName} • ${src.plant?.code || 'All Plants'} • ${src.product?.code || 'All Products'}`,
          metricOrCode: src.targetMetric,
          sourceValue: src.targetValue,
          targetValue: null,
          unit: src.unitOfMeasure,
          changeType: 'REMOVED',
          delta: null,
        });
      }
    }
  }

  // 2. Compare Assumptions
  if (!categoryFilter || categoryFilter === 'ALL' || categoryFilter === 'ASSUMPTIONS') {
    const srcAssumptions = await db.assumption.findMany({
      where: { organizationId: orgId, planVersionId: sourceVersionId },
    });
    const tgtAssumptions = await db.assumption.findMany({
      where: { organizationId: orgId, planVersionId: targetVersionId },
    });

    const srcMap = new Map<string, typeof srcAssumptions[0]>();
    for (const a of srcAssumptions) srcMap.set(a.code, a);

    const tgtMap = new Map<string, typeof tgtAssumptions[0]>();
    for (const a of tgtAssumptions) {
      tgtMap.set(a.code, a);
      const src = srcMap.get(a.code);

      const tgtVal = a.numericValue ?? a.textValue ?? (a.booleanValue !== null ? String(a.booleanValue) : null);
      if (!src) {
        diffs.push({
          id: `asm-${a.id}`,
          category: 'ASSUMPTIONS',
          dimension: `${a.category} • ${a.name}`,
          metricOrCode: a.code,
          sourceValue: null,
          targetValue: tgtVal,
          unit: a.unit,
          changeType: 'ADDED',
          delta: null,
        });
      } else {
        const srcVal = src.numericValue ?? src.textValue ?? (src.booleanValue !== null ? String(src.booleanValue) : null);
        if (srcVal !== tgtVal) {
          const delta = typeof srcVal === 'number' && typeof tgtVal === 'number' ? tgtVal - srcVal : null;
          diffs.push({
            id: `asm-${a.id}`,
            category: 'ASSUMPTIONS',
            dimension: `${a.category} • ${a.name}`,
            metricOrCode: a.code,
            sourceValue: srcVal,
            targetValue: tgtVal,
            unit: a.unit,
            changeType: 'CHANGED',
            delta,
          });
        } else {
          diffs.push({
            id: `asm-${a.id}`,
            category: 'ASSUMPTIONS',
            dimension: `${a.category} • ${a.name}`,
            metricOrCode: a.code,
            sourceValue: srcVal,
            targetValue: tgtVal,
            unit: a.unit,
            changeType: 'UNCHANGED',
            delta: 0,
          });
        }
      }
    }

    for (const [code, src] of srcMap.entries()) {
      if (!tgtMap.has(code)) {
        const srcVal = src.numericValue ?? src.textValue ?? (src.booleanValue !== null ? String(src.booleanValue) : null);
        diffs.push({
          id: `asm-rm-${src.id}`,
          category: 'ASSUMPTIONS',
          dimension: `${src.category} • ${src.name}`,
          metricOrCode: src.code,
          sourceValue: srcVal,
          targetValue: null,
          unit: src.unit,
          changeType: 'REMOVED',
          delta: null,
        });
      }
    }
  }

  // 3. Compare Plan Inputs
  if (
    !categoryFilter ||
    categoryFilter === 'ALL' ||
    categoryFilter === 'INPUTS' ||
    ['DEMAND', 'PRODUCTION', 'OPEX'].includes(categoryFilter)
  ) {
    const inputCatWhere = categoryFilter && ['DEMAND', 'PRODUCTION', 'OPEX'].includes(categoryFilter)
      ? { inputCategory: categoryFilter }
      : {};

    const srcInputs = await db.planInput.findMany({
      where: { organizationId: orgId, planVersionId: sourceVersionId, ...inputCatWhere },
      include: { fiscalPeriod: true, plant: true, product: true },
    });
    const tgtInputs = await db.planInput.findMany({
      where: { organizationId: orgId, planVersionId: targetVersionId, ...inputCatWhere },
      include: { fiscalPeriod: true, plant: true, product: true },
    });

    const srcMap = new Map<string, typeof srcInputs[0]>();
    for (const inp of srcInputs) {
      const key = `${inp.inputCategory}-${inp.inputCode}-${inp.fiscalPeriod.periodNumber}-${inp.plantId || 'ALL'}-${inp.productId || 'ALL'}`;
      srcMap.set(key, inp);
    }

    const tgtMap = new Map<string, typeof tgtInputs[0]>();
    for (const inp of tgtInputs) {
      const key = `${inp.inputCategory}-${inp.inputCode}-${inp.fiscalPeriod.periodNumber}-${inp.plantId || 'ALL'}-${inp.productId || 'ALL'}`;
      tgtMap.set(key, inp);

      const src = srcMap.get(key);
      if (!src) {
        diffs.push({
          id: `inp-${inp.id}`,
          category: inp.inputCategory,
          dimension: `${inp.fiscalPeriod.periodName} • ${inp.plant?.code || 'All Plants'} • ${inp.product?.code || 'All Products'}`,
          metricOrCode: inp.inputCode,
          sourceValue: null,
          targetValue: inp.inputValue,
          unit: inp.unitOfMeasure,
          changeType: 'ADDED',
          delta: null,
        });
      } else if (src.inputValue !== inp.inputValue) {
        diffs.push({
          id: `inp-${inp.id}`,
          category: inp.inputCategory,
          dimension: `${inp.fiscalPeriod.periodName} • ${inp.plant?.code || 'All Plants'} • ${inp.product?.code || 'All Products'}`,
          metricOrCode: inp.inputCode,
          sourceValue: src.inputValue,
          targetValue: inp.inputValue,
          unit: inp.unitOfMeasure,
          changeType: 'CHANGED',
          delta: inp.inputValue - src.inputValue,
        });
      } else {
        diffs.push({
          id: `inp-${inp.id}`,
          category: inp.inputCategory,
          dimension: `${inp.fiscalPeriod.periodName} • ${inp.plant?.code || 'All Plants'} • ${inp.product?.code || 'All Products'}`,
          metricOrCode: inp.inputCode,
          sourceValue: src.inputValue,
          targetValue: inp.inputValue,
          unit: inp.unitOfMeasure,
          changeType: 'UNCHANGED',
          delta: 0,
        });
      }
    }

    for (const [key, src] of srcMap.entries()) {
      if (!tgtMap.has(key)) {
        diffs.push({
          id: `inp-rm-${src.id}`,
          category: src.inputCategory,
          dimension: `${src.fiscalPeriod.periodName} • ${src.plant?.code || 'All Plants'} • ${src.product?.code || 'All Products'}`,
          metricOrCode: src.inputCode,
          sourceValue: src.inputValue,
          targetValue: null,
          unit: src.unitOfMeasure,
          changeType: 'REMOVED',
          delta: null,
        });
      }
    }
  }

  const summary = {
    sourceVersion: { id: source.id, code: source.versionCode, name: source.versionName, status: source.status },
    targetVersion: { id: target.id, code: target.versionCode, name: target.versionName, status: target.status },
    totalAdded: diffs.filter((d) => d.changeType === 'ADDED').length,
    totalRemoved: diffs.filter((d) => d.changeType === 'REMOVED').length,
    totalChanged: diffs.filter((d) => d.changeType === 'CHANGED').length,
    totalUnchanged: diffs.filter((d) => d.changeType === 'UNCHANGED').length,
    totalRecords: diffs.length,
  };

  return { summary, diffs };
}
