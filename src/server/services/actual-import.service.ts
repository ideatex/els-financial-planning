/**
 * Actuals Import, Profiling, Mapping, Validation, and Transactional Commit Service
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { BadRequestError, NotFoundError, ConflictError } from '@/core/errors/AppError';
import { reconcileBatch } from './reconciliation.service';

export interface UploadBatchInput {
  name: string;
  description?: string;
  sourceType?: 'CSV' | 'XLSX' | 'ERP' | 'MANUAL';
  originalFileName: string;
  fileContent: string; // CSV text or base64
  importType: 'GL_ACTUALS' | 'REVENUE_ACTUALS' | 'PRODUCTION_ACTUALS' | 'MATERIAL_ACTUALS' | 'LABOR_ACTUALS' | 'OPEX_ACTUALS';
  fiscalPeriodId: string;
  plantId?: string;
  currency?: string;
  controlTotal?: number;
}

export interface ColumnMappingConfig {
  dateColumn?: string;
  plantColumn?: string;
  productColumn?: string;
  materialColumn?: string;
  accountColumn?: string;
  amountColumn?: string;
  quantityColumn?: string;
  unitRateColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  descriptionColumn?: string;
  externalRefColumn?: string;
  operationalTypeColumn?: string;
  unitOfMeasureColumn?: string;
}

export interface BatchFilterOptions {
  fiscalPeriodId?: string;
  plantId?: string;
  importType?: string;
  status?: string;
  page?: number;
  limit?: number;
}

/**
 * Parses CSV text with standard RFC 4180 handling for quotes and commas.
 */
export function parseCsvText(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  function splitLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  const headers = splitLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

/**
 * Computes SHA-256 hash of file content.
 */
export function computeFileHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Profiles uploaded file content without committing actuals.
 */
export function profileCsvContent(content: string, fileName: string) {
  const { headers, rows } = parseCsvText(content);
  const sampleRows = rows.slice(0, 5);

  const detectedDateFields: string[] = [];
  const detectedNumericFields: string[] = [];

  if (rows.length > 0) {
    headers.forEach((h) => {
      const sampleVal = rows[0][h];
      if (!sampleVal) return;
      if (!isNaN(Date.parse(sampleVal)) && isNaN(Number(sampleVal)) && (sampleVal.includes('-') || sampleVal.includes('/'))) {
        detectedDateFields.push(h);
      } else if (!isNaN(Number(sampleVal.replace(/[$,]/g, '')))) {
        detectedNumericFields.push(h);
      }
    });
  }

  return {
    fileName,
    fileSize: Buffer.byteLength(content, 'utf8'),
    rowCount: rows.length,
    columnNames: headers,
    sampleRows,
    detectedDateFields,
    detectedNumericFields,
  };
}

/**
 * 1. Uploads actuals file, detects duplicate hashes, and stores preliminary batch & rows.
 */
export async function uploadActualsBatch(orgId: string, userId: string, input: UploadBatchInput) {
  const fileHash = computeFileHash(input.fileContent);

  // Check for duplicate file hash in the organization
  const existingBatch = await db.actualImportBatch.findFirst({
    where: {
      organizationId: orgId,
      fileHash,
      status: { notIn: ['REVERSED', 'SUPERSEDED'] },
    },
  });

  if (existingBatch) {
    throw new ConflictError(
      `An active actuals batch ("${existingBatch.name}") with the exact same file content hash (${fileHash.slice(0, 8)}...) already exists.`
    );
  }

  // Parse CSV
  const { headers, rows } = parseCsvText(input.fileContent);
  if (rows.length === 0) {
    throw new BadRequestError('The uploaded actuals file contains no data rows.');
  }

  // Generate suggested column mappings
  const mappingConfig: ColumnMappingConfig = {};
  headers.forEach((h) => {
    const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (['date', 'txndate', 'transactiondate', 'postingdate', 'perioddate'].includes(lower)) {
      mappingConfig.dateColumn = h;
    } else if (['plant', 'plantcode', 'facility', 'plantid'].includes(lower)) {
      mappingConfig.plantColumn = h;
    } else if (['product', 'productcode', 'sku', 'partnumber', 'productid'].includes(lower)) {
      mappingConfig.productColumn = h;
    } else if (['material', 'materialcode', 'matcode', 'rawmaterial'].includes(lower)) {
      mappingConfig.materialColumn = h;
    } else if (['account', 'accountcode', 'glaccount', 'accountnumber', 'acct'].includes(lower)) {
      mappingConfig.accountColumn = h;
    } else if (['amount', 'totalamount', 'netamount', 'cost', 'revenue', 'actualamount'].includes(lower)) {
      mappingConfig.amountColumn = h;
    } else if (['quantity', 'qty', 'volume', 'units', 'actualqty'].includes(lower)) {
      mappingConfig.quantityColumn = h;
    } else if (['rate', 'unitrate', 'price', 'unitcost'].includes(lower)) {
      mappingConfig.unitRateColumn = h;
    } else if (['debit', 'debitamount', 'dr'].includes(lower)) {
      mappingConfig.debitColumn = h;
    } else if (['credit', 'creditamount', 'cr'].includes(lower)) {
      mappingConfig.creditColumn = h;
    } else if (['description', 'memo', 'narration', 'desc', 'lineitem'].includes(lower)) {
      mappingConfig.descriptionColumn = h;
    } else if (['ref', 'reference', 'externalref', 'invoice', 'docnumber'].includes(lower)) {
      mappingConfig.externalRefColumn = h;
    }
  });

  return await db.$transaction(async (tx) => {
    const batch = await tx.actualImportBatch.create({
      data: {
        organizationId: orgId,
        name: input.name,
        description: input.description ?? null,
        sourceType: input.sourceType ?? 'CSV',
        originalFileName: input.originalFileName,
        fileSize: Buffer.byteLength(input.fileContent, 'utf8'),
        fileHash,
        importType: input.importType,
        fiscalPeriodId: input.fiscalPeriodId,
        plantId: input.plantId ?? null,
        currency: input.currency ?? 'USD',
        status: 'UPLOADED',
        uploadedById: userId,
        controlTotal: input.controlTotal ?? null,
        mappingConfig: JSON.stringify(mappingConfig),
        sourceFileContent: input.fileContent,
        metadata: JSON.stringify({
          headers,
          totalRows: rows.length,
        }),
      },
    });

    // Create raw import row records
    await tx.actualImportRow.createMany({
      data: rows.map((r, idx) => ({
        importBatchId: batch.id,
        rowNumber: idx + 1,
        rawPayload: JSON.stringify(r),
        validationStatus: 'VALID',
        mappingStatus: 'UNMAPPED',
      })),
    });

    return batch;
  }, {
    timeout: 30000,
    maxWait: 10000,
  }).then(async (batch) => {
    await recordAuditLog({
      organizationId: orgId,
      userId,
      action: 'ACTUALS_BATCH_UPLOADED',
      entityType: 'ActualImportBatch',
      entityId: batch.id,
      metadata: {
        name: batch.name,
        importType: batch.importType,
        totalRows: rows.length,
        fileHash,
      },
    });

    return batch;
  });
}

/**
 * 2. Saves or updates column mapping configuration for an import batch.
 */
export async function saveMappingProfile(
  orgId: string,
  userId: string,
  batchId: string,
  mappingConfig: ColumnMappingConfig
) {
  const batch = await db.actualImportBatch.findFirst({
    where: { id: batchId, organizationId: orgId },
  });

  if (!batch) {
    throw new NotFoundError(`Actuals batch '${batchId}' not found.`);
  }

  if (['LOCKED', 'REVERSED', 'SUPERSEDED'].includes(batch.status)) {
    throw new BadRequestError(`Cannot modify mappings for batch in '${batch.status}' status.`);
  }

  const updated = await db.actualImportBatch.update({
    where: { id: batchId },
    data: {
      mappingConfig: JSON.stringify(mappingConfig),
      status: 'PARSING',
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ACTUALS_MAPPING_UPDATED',
    entityType: 'ActualImportBatch',
    entityId: batch.id,
    metadata: mappingConfig as unknown as Record<string, unknown>,
  });

  return updated;
}

/**
 * 3. Validates actuals batch records row-by-row against master data, fiscal periods, and control totals.
 */
export async function validateActualsBatch(orgId: string, userId: string, batchId: string) {
  const batch = await db.actualImportBatch.findFirst({
    where: { id: batchId, organizationId: orgId },
    include: { fiscalPeriod: true },
  });

  if (!batch) {
    throw new NotFoundError(`Actuals batch '${batchId}' not found.`);
  }

  if (['LOCKED', 'REVERSED', 'SUPERSEDED'].includes(batch.status)) {
    throw new BadRequestError(`Cannot validate batch in '${batch.status}' status.`);
  }

  const mappingConfig: ColumnMappingConfig = batch.mappingConfig ? JSON.parse(batch.mappingConfig) : {};
  const rows = await db.actualImportRow.findMany({
    where: { importBatchId: batchId },
    orderBy: { rowNumber: 'asc' },
  });

  // Pre-load reference dictionaries for fast lookup
  const [plants, products, materials, accounts] = await Promise.all([
    db.plant.findMany({ where: { organizationId: orgId } }),
    db.product.findMany({ where: { organizationId: orgId } }),
    db.material.findMany({ where: { organizationId: orgId } }),
    db.account.findMany({ where: { organizationId: orgId } }),
  ]);

  const plantMap = new Map<string, string>();
  plants.forEach((p) => {
    plantMap.set(p.code.toUpperCase(), p.id);
    plantMap.set(p.name.toUpperCase(), p.id);
    plantMap.set(p.id, p.id);
  });

  const productMap = new Map<string, string>();
  products.forEach((p) => {
    productMap.set(p.code.toUpperCase(), p.id);
    productMap.set(p.name.toUpperCase(), p.id);
    productMap.set(p.id, p.id);
  });

  const materialMap = new Map<string, string>();
  materials.forEach((m) => {
    materialMap.set(m.code.toUpperCase(), m.id);
    materialMap.set(m.name.toUpperCase(), m.id);
    materialMap.set(m.id, m.id);
  });

  const accountMap = new Map<string, string>();
  accounts.forEach((a) => {
    accountMap.set(a.code.toUpperCase(), a.id);
    accountMap.set(a.name.toUpperCase(), a.id);
    accountMap.set(a.id, a.id);
  });

  let validCount = 0;
  let rejectedCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let calculatedImportedTotal = 0;

  const rowUpdates = [];

  for (const row of rows) {
    const payload: Record<string, string> = JSON.parse(row.rawPayload);
    const errors: string[] = [];
    const warnings: string[] = [];
    const resolved: { plantId?: string; productId?: string; materialId?: string; accountId?: string } = {};

    // 1. Transaction / Record Date
    let txnDate: Date | null = null;
    if (mappingConfig.dateColumn && payload[mappingConfig.dateColumn]) {
      const parsedDate = new Date(payload[mappingConfig.dateColumn]);
      if (isNaN(parsedDate.getTime())) {
        errors.push(`Invalid date format: "${payload[mappingConfig.dateColumn]}"`);
      } else {
        txnDate = parsedDate;
        // Verify period containment
        if (txnDate < batch.fiscalPeriod.startDate || txnDate > batch.fiscalPeriod.endDate) {
          warnings.push(
            `Transaction date (${txnDate.toISOString().slice(0, 10)}) is outside period window (${batch.fiscalPeriod.periodName}).`
          );
          warningCount++;
        }
      }
    } else {
      // Default to period start date if not provided
      txnDate = batch.fiscalPeriod.startDate;
    }

    // 2. Resolve Plant
    if (mappingConfig.plantColumn && payload[mappingConfig.plantColumn]) {
      const val = payload[mappingConfig.plantColumn].toUpperCase();
      const pId = plantMap.get(val);
      if (!pId) {
        warnings.push(`Plant reference "${payload[mappingConfig.plantColumn]}" not found in master data.`);
        warningCount++;
      } else {
        resolved.plantId = pId;
      }
    } else if (batch.plantId) {
      resolved.plantId = batch.plantId;
    }

    // 3. Resolve Product
    if (mappingConfig.productColumn && payload[mappingConfig.productColumn]) {
      const val = payload[mappingConfig.productColumn].toUpperCase();
      const pId = productMap.get(val);
      if (!pId) {
        warnings.push(`Product reference "${payload[mappingConfig.productColumn]}" not found in master data.`);
        warningCount++;
      } else {
        resolved.productId = pId;
      }
    }

    // 4. Resolve Material
    if (mappingConfig.materialColumn && payload[mappingConfig.materialColumn]) {
      const val = payload[mappingConfig.materialColumn].toUpperCase();
      const mId = materialMap.get(val);
      if (!mId) {
        warnings.push(`Material reference "${payload[mappingConfig.materialColumn]}" not found in master data.`);
        warningCount++;
      } else {
        resolved.materialId = mId;
      }
    }

    // 5. Resolve Account
    if (mappingConfig.accountColumn && payload[mappingConfig.accountColumn]) {
      const val = payload[mappingConfig.accountColumn].toUpperCase();
      const aId = accountMap.get(val);
      if (!aId) {
        warnings.push(`Account reference "${payload[mappingConfig.accountColumn]}" not found in Chart of Accounts.`);
        warningCount++;
      } else {
        resolved.accountId = aId;
      }
    }

    // 6. Resolve Amount / Quantity
    let amount = 0;
    if (mappingConfig.amountColumn && payload[mappingConfig.amountColumn]) {
      const rawAmt = payload[mappingConfig.amountColumn].replace(/[$,]/g, '');
      const parsedAmt = parseFloat(rawAmt);
      if (isNaN(parsedAmt)) {
        errors.push(`Invalid amount value: "${payload[mappingConfig.amountColumn]}"`);
      } else {
        amount = parsedAmt;
        calculatedImportedTotal += amount;
      }
    } else if (mappingConfig.debitColumn || mappingConfig.creditColumn) {
      const debit = mappingConfig.debitColumn && payload[mappingConfig.debitColumn] ? parseFloat(payload[mappingConfig.debitColumn].replace(/[$,]/g, '')) || 0 : 0;
      const credit = mappingConfig.creditColumn && payload[mappingConfig.creditColumn] ? parseFloat(payload[mappingConfig.creditColumn].replace(/[$,]/g, '')) || 0 : 0;
      amount = debit - credit;
      calculatedImportedTotal += amount;
    }

    let quantity: number | null = null;
    if (mappingConfig.quantityColumn && payload[mappingConfig.quantityColumn]) {
      const rawQty = payload[mappingConfig.quantityColumn].replace(/,/g, '');
      const parsedQty = parseFloat(rawQty);
      if (isNaN(parsedQty)) {
        errors.push(`Invalid quantity value: "${payload[mappingConfig.quantityColumn]}"`);
      } else {
        quantity = parsedQty;
      }
    }

    const rowStatus = errors.length > 0 ? 'ERROR' : warnings.length > 0 ? 'WARNING' : 'VALID';
    if (errors.length > 0) {
      rejectedCount++;
      errorCount += errors.length;
    } else {
      validCount++;
    }

    rowUpdates.push({
      id: row.id,
      validationStatus: rowStatus,
      mappingStatus: 'MAPPED',
      errorMessages: errors.length > 0 ? JSON.stringify(errors) : null,
      warningMessages: warnings.length > 0 ? JSON.stringify(warnings) : null,
      resolvedEntityReferences: JSON.stringify(resolved),
      normalizedPayload: JSON.stringify({
        transactionDate: txnDate,
        amount,
        quantity,
        description: mappingConfig.descriptionColumn ? payload[mappingConfig.descriptionColumn] : null,
        externalReference: mappingConfig.externalRefColumn ? payload[mappingConfig.externalRefColumn] : null,
      }),
    });
  }

  // Update row statuses in database
  for (const update of rowUpdates) {
    await db.actualImportRow.update({
      where: { id: update.id },
      data: {
        validationStatus: update.validationStatus,
        mappingStatus: update.mappingStatus,
        errorMessages: update.errorMessages,
        warningMessages: update.warningMessages,
        resolvedEntityReferences: update.resolvedEntityReferences,
        normalizedPayload: update.normalizedPayload,
      },
    });
  }

  // Control Total Check
  if (batch.controlTotal !== null && batch.controlTotal !== undefined) {
    const diff = Math.abs(calculatedImportedTotal - batch.controlTotal);
    if (diff > 0.01) {
      warningCount++;
    }
  }

  const finalStatus = errorCount > 0 && validCount === 0 ? 'VALIDATION_FAILED' : 'VALIDATED';

  const updatedBatch = await db.actualImportBatch.update({
    where: { id: batchId },
    data: {
      status: finalStatus,
      validatedById: userId,
      validatedAt: new Date(),
      importedTotal: calculatedImportedTotal,
      acceptedRowCount: validCount,
      rejectedRowCount: rejectedCount,
      warningCount,
      errorCount,
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ACTUALS_BATCH_VALIDATED',
    entityType: 'ActualImportBatch',
    entityId: batch.id,
    metadata: {
      status: finalStatus,
      acceptedRowCount: validCount,
      rejectedRowCount: rejectedCount,
      importedTotal: calculatedImportedTotal,
      errorCount,
      warningCount,
    },
  });

  return updatedBatch;
}

/**
 * 4. Transactional commit: Materializes valid rows into ActualFinancialRecord and ActualOperationalRecord.
 */
export async function commitActualsImport(orgId: string, userId: string, batchId: string) {
  const batch = await db.actualImportBatch.findFirst({
    where: { id: batchId, organizationId: orgId },
    include: { fiscalPeriod: true },
  });

  if (!batch) {
    throw new NotFoundError(`Actuals batch '${batchId}' not found.`);
  }

  if (['LOCKED', 'REVERSED', 'SUPERSEDED'].includes(batch.status)) {
    throw new BadRequestError(`Cannot commit batch in '${batch.status}' status.`);
  }

  if (batch.status !== 'VALIDATED') {
    throw new BadRequestError(`Batch must be validated before commit. Current status is '${batch.status}'.`);
  }

  const rows = await db.actualImportRow.findMany({
    where: {
      importBatchId: batchId,
      validationStatus: { in: ['VALID', 'WARNING'] },
    },
    orderBy: { rowNumber: 'asc' },
  });

  if (rows.length === 0) {
    throw new BadRequestError('No valid rows available to commit in this batch.');
  }

  return await db.$transaction(async (tx) => {
    const financialRecordsToCreate = [];
    const operationalRecordsToCreate = [];

    for (const row of rows) {
      const norm = row.normalizedPayload ? JSON.parse(row.normalizedPayload) : {};
      const resolved = row.resolvedEntityReferences ? JSON.parse(row.resolvedEntityReferences) : {};
      const date = norm.transactionDate ? new Date(norm.transactionDate) : batch.fiscalPeriod.startDate;

      if (['GL_ACTUALS', 'REVENUE_ACTUALS', 'MATERIAL_ACTUALS', 'LABOR_ACTUALS', 'OPEX_ACTUALS'].includes(batch.importType)) {
        financialRecordsToCreate.push({
          organizationId: orgId,
          importBatchId: batch.id,
          fiscalPeriodId: batch.fiscalPeriodId,
          transactionDate: date,
          plantId: resolved.plantId ?? batch.plantId ?? null,
          productId: resolved.productId ?? null,
          materialId: resolved.materialId ?? null,
          accountId: resolved.accountId ?? null,
          currency: batch.currency,
          amount: norm.amount ?? 0,
          quantity: norm.quantity ?? null,
          description: norm.description ?? null,
          externalReference: norm.externalReference ?? null,
          sourceRowNumber: row.rowNumber,
          mappingStatus: 'MAPPED',
          reconciliationStatus: 'RECONCILED',
        });
      }

      if (['PRODUCTION_ACTUALS', 'REVENUE_ACTUALS', 'MATERIAL_ACTUALS', 'LABOR_ACTUALS'].includes(batch.importType)) {
        let opType = 'PRODUCTION_VOLUME';
        if (batch.importType === 'REVENUE_ACTUALS') opType = 'SALES_VOLUME';
        if (batch.importType === 'MATERIAL_ACTUALS') opType = 'MATERIAL_CONSUMPTION';
        if (batch.importType === 'LABOR_ACTUALS') opType = 'LABOR_HOURS';

        if (norm.quantity !== null && norm.quantity !== undefined) {
          operationalRecordsToCreate.push({
            organizationId: orgId,
            importBatchId: batch.id,
            fiscalPeriodId: batch.fiscalPeriodId,
            recordDate: date,
            plantId: resolved.plantId ?? batch.plantId ?? null,
            productId: resolved.productId ?? null,
            materialId: resolved.materialId ?? null,
            operationalType: opType,
            quantity: norm.quantity,
            unitOfMeasure: 'EA',
            totalCost: norm.amount ?? null,
            description: norm.description ?? null,
            externalReference: norm.externalReference ?? null,
            sourceRowNumber: row.rowNumber,
            mappingStatus: 'MAPPED',
            reconciliationStatus: 'RECONCILED',
          });
        }
      }
    }

    if (financialRecordsToCreate.length > 0) {
      await tx.actualFinancialRecord.createMany({ data: financialRecordsToCreate });
    }

    if (operationalRecordsToCreate.length > 0) {
      await tx.actualOperationalRecord.createMany({ data: operationalRecordsToCreate });
    }

    const updatedBatch = await tx.actualImportBatch.update({
      where: { id: batchId },
      data: {
        status: batch.rejectedRowCount > 0 ? 'PARTIALLY_IMPORTED' : 'IMPORTED',
        importedById: userId,
        importedAt: new Date(),
      },
    });

    return updatedBatch;
  }, {
    timeout: 30000,
    maxWait: 10000,
  }).then(async (committedBatch) => {
    // 5. Trigger automated reconciliation after successful commit
    await reconcileBatch(orgId, committedBatch.id);

    await recordAuditLog({
      organizationId: orgId,
      userId,
      action: 'ACTUALS_BATCH_COMMITTED',
      entityType: 'ActualImportBatch',
      entityId: committedBatch.id,
      metadata: {
        status: committedBatch.status,
        acceptedRowCount: committedBatch.acceptedRowCount,
        importedTotal: committedBatch.importedTotal,
      },
    });

    return committedBatch;
  });
}

/**
 * 5. Locks an imported batch, making it permanently immutable.
 */
export async function lockActualsBatch(orgId: string, userId: string, batchId: string) {
  const batch = await db.actualImportBatch.findFirst({
    where: { id: batchId, organizationId: orgId },
  });

  if (!batch) {
    throw new NotFoundError(`Actuals batch '${batchId}' not found.`);
  }

  if (!['IMPORTED', 'PARTIALLY_IMPORTED'].includes(batch.status)) {
    throw new BadRequestError(`Only imported batches can be locked. Current status is '${batch.status}'.`);
  }

  const updated = await db.actualImportBatch.update({
    where: { id: batchId },
    data: {
      status: 'LOCKED',
      lockedById: userId,
      lockedAt: new Date(),
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'ACTUALS_BATCH_LOCKED',
    entityType: 'ActualImportBatch',
    entityId: batch.id,
  });

  return updated;
}

/**
 * 6. Reverses an imported batch with audit justification.
 */
export async function reverseActualsBatch(orgId: string, userId: string, batchId: string, reason: string) {
  if (!reason || reason.trim().length === 0) {
    throw new BadRequestError('A reversal reason is required.');
  }

  const batch = await db.actualImportBatch.findFirst({
    where: { id: batchId, organizationId: orgId },
    include: { financialRecords: true, operationalRecords: true },
  });

  if (!batch) {
    throw new NotFoundError(`Actuals batch '${batchId}' not found.`);
  }

  if (batch.status === 'REVERSED') {
    throw new BadRequestError('Batch is already reversed.');
  }

  return await db.$transaction(async (tx) => {
    // Delete or mark records reversed
    await tx.actualFinancialRecord.deleteMany({
      where: { importBatchId: batchId },
    });

    await tx.actualOperationalRecord.deleteMany({
      where: { importBatchId: batchId },
    });

    const updated = await tx.actualImportBatch.update({
      where: { id: batchId },
      data: {
        status: 'REVERSED',
        reversalReason: reason,
        reconciliationStatus: 'FAILED',
      },
    });

    return updated;
  }).then(async (reversedBatch) => {
    await recordAuditLog({
      organizationId: orgId,
      userId,
      action: 'ACTUALS_BATCH_REVERSED',
      entityType: 'ActualImportBatch',
      entityId: reversedBatch.id,
      metadata: { reason },
    });

    return reversedBatch;
  });
}

/**
 * Queries batches with filtering.
 */
export async function getActualImportBatches(orgId: string, filters: BatchFilterOptions = {}) {
  const where: Record<string, unknown> = { organizationId: orgId };

  if (filters.fiscalPeriodId) where.fiscalPeriodId = filters.fiscalPeriodId;
  if (filters.plantId) where.plantId = filters.plantId;
  if (filters.importType) where.importType = filters.importType;
  if (filters.status) where.status = filters.status;

  const batches = await db.actualImportBatch.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      fiscalPeriod: { select: { id: true, periodName: true, fiscalYear: true, quarter: true } },
      plant: { select: { id: true, code: true, name: true } },
      uploadedByUser: { select: { id: true, name: true, email: true } },
      lockedByUser: { select: { id: true, name: true, email: true } },
    },
  });

  return batches;
}

/**
 * Retrieves batch detail by ID.
 */
export async function getActualImportBatchById(orgId: string, batchId: string) {
  const batch = await db.actualImportBatch.findFirst({
    where: { id: batchId, organizationId: orgId },
    include: {
      fiscalPeriod: true,
      plant: true,
      uploadedByUser: { select: { id: true, name: true, email: true } },
      validatedByUser: { select: { id: true, name: true, email: true } },
      importedByUser: { select: { id: true, name: true, email: true } },
      lockedByUser: { select: { id: true, name: true, email: true } },
      reconciliationResults: true,
    },
  });

  if (!batch) {
    throw new NotFoundError(`Actuals batch '${batchId}' not found.`);
  }

  return batch;
}

/**
 * Retrieves rows for an import batch.
 */
export async function getActualImportBatchRows(orgId: string, batchId: string, page = 1, limit = 50) {
  const batch = await db.actualImportBatch.findFirst({
    where: { id: batchId, organizationId: orgId },
  });

  if (!batch) {
    throw new NotFoundError(`Actuals batch '${batchId}' not found.`);
  }

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    db.actualImportRow.findMany({
      where: { importBatchId: batchId },
      orderBy: { rowNumber: 'asc' },
      skip,
      take: limit,
    }),
    db.actualImportRow.count({ where: { importBatchId: batchId } }),
  ]);

  return { rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}
