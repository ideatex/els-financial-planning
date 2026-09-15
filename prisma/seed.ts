import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial manufacturing FP&A database with Phase 1 & Phase 2 foundation...');

  const passwordHash = await bcrypt.hash('Password123!', 12);

  // 1. Create Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'precision-mfg' },
    update: {},
    create: {
      name: 'Precision Manufacturing Corp',
      slug: 'precision-mfg',
    },
  });

  console.log(`Organization verified: ${org.name} (${org.id})`);

  // 2. Users definitions
  const usersData = [
    {
      email: 'admin@precisionmfg.com',
      name: 'Elena Rostova (Admin)',
      role: 'ADMIN',
    },
    {
      email: 'planner@precisionmfg.com',
      name: 'Marcus Vance (Lead Planner)',
      role: 'PLANNER',
    },
    {
      email: 'reviewer@precisionmfg.com',
      name: 'Sarah Chen (Finance Director / Reviewer)',
      role: 'REVIEWER',
    },
  ];

  const userMap = new Map<string, string>();

  for (const item of usersData) {
    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: { name: item.name, passwordHash },
      create: {
        email: item.email,
        name: item.name,
        passwordHash,
      },
    });

    userMap.set(item.role, user.id);

    await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: org.id,
        },
      },
      update: { role: item.role },
      create: {
        userId: user.id,
        organizationId: org.id,
        role: item.role,
      },
    });

    console.log(`User seeded: ${user.email} (${item.role})`);
  }

  const adminId = userMap.get('ADMIN')!;
  const plannerId = userMap.get('PLANNER')!;

  // 3. Plants
  const detPlant = await prisma.plant.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: 'DET-01',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      code: 'DET-01',
      name: 'Detroit Primary Assembly Plant',
      city: 'Detroit',
      state: 'MI',
      country: 'USA',
      timeZone: 'America/Detroit',
      baseCurrency: 'USD',
      isActive: true,
      createdById: adminId,
    },
  });

  const clePlant = await prisma.plant.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: 'CLE-02',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      code: 'CLE-02',
      name: 'Cleveland Precision Machining Center',
      city: 'Cleveland',
      state: 'OH',
      country: 'USA',
      timeZone: 'America/New_York',
      baseCurrency: 'USD',
      isActive: true,
      createdById: adminId,
    },
  });

  console.log(`Seeded plants: DET-01 (${detPlant.id}), CLE-02 (${clePlant.id})`);

  // 4. Raw Materials
  const rmSteel = await prisma.material.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'RM-STEEL-01' } },
    update: {},
    create: {
      organizationId: org.id,
      code: 'RM-STEEL-01',
      name: 'Cold-Rolled Steel Sheet 2mm',
      category: 'Metals',
      unitOfMeasure: 'KG',
      defaultCostCents: 450, // $4.50
      currency: 'USD',
      leadTimeDays: 14,
      supplierReference: 'SUP-STEEL-44',
      isActive: true,
      createdById: adminId,
    },
  });

  const rmAlum = await prisma.material.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'RM-ALUM-02' } },
    update: {},
    create: {
      organizationId: org.id,
      code: 'RM-ALUM-02',
      name: 'Extruded Aluminum Alloy 6061',
      category: 'Metals',
      unitOfMeasure: 'KG',
      defaultCostCents: 725, // $7.25
      currency: 'USD',
      leadTimeDays: 10,
      supplierReference: 'SUP-ALUM-12',
      isActive: true,
      createdById: adminId,
    },
  });

  const rmFast = await prisma.material.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'RM-FAST-03' } },
    update: {},
    create: {
      organizationId: org.id,
      code: 'RM-FAST-03',
      name: 'High-Tensile Fastener Hardware Kit M8',
      category: 'Hardware',
      unitOfMeasure: 'KIT',
      defaultCostCents: 120, // $1.20
      currency: 'USD',
      leadTimeDays: 5,
      supplierReference: 'SUP-FAST-90',
      isActive: true,
      createdById: adminId,
    },
  });

  console.log('Seeded raw materials: RM-STEEL-01, RM-ALUM-02, RM-FAST-03');

  // 5. Products
  const saCylinder = await prisma.product.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'SA-CYLINDER-01' } },
    update: {},
    create: {
      organizationId: org.id,
      code: 'SA-CYLINDER-01',
      name: 'Machined Hydraulic Cylinder Subassembly',
      category: 'Subassemblies',
      productType: 'SEMI_FINISHED_GOOD',
      unitOfMeasure: 'EA',
      defaultPlantId: clePlant.id,
      standardPriceCents: 18500, // $185.00
      currency: 'USD',
      isActive: true,
      createdById: adminId,
    },
  });

  const fgActuator = await prisma.product.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'FG-ACTUATOR-500' } },
    update: {},
    create: {
      organizationId: org.id,
      code: 'FG-ACTUATOR-500',
      name: 'Industrial Pneumatic Actuator 500 PSI',
      category: 'Actuators',
      productType: 'FINISHED_GOOD',
      unitOfMeasure: 'EA',
      defaultPlantId: detPlant.id,
      standardPriceCents: 48000, // $480.00
      currency: 'USD',
      isActive: true,
      createdById: adminId,
    },
  });

  console.log('Seeded products: SA-CYLINDER-01, FG-ACTUATOR-500');

  // 6. BOM Header & Version
  const existingBom = await prisma.bomHeader.findFirst({
    where: { organizationId: org.id, productId: fgActuator.id, name: 'Primary Production BOM' },
    include: { versions: true },
  });

  if (!existingBom) {
    const bomHeader = await prisma.bomHeader.create({
      data: {
        organizationId: org.id,
        productId: fgActuator.id,
        name: 'Primary Production BOM',
        description: 'Standard multi-level bill of materials for industrial actuator',
        isActive: true,
        createdById: adminId,
        versions: {
          create: {
            versionNumber: 1,
            status: 'APPROVED',
            createdById: adminId,
            lines: {
              create: [
                {
                  componentType: 'PRODUCT',
                  componentProductId: saCylinder.id,
                  quantityPerUnit: 1.0,
                  unitOfMeasure: 'EA',
                  scrapPercentage: 0.0,
                  createdById: adminId,
                },
                {
                  componentType: 'MATERIAL',
                  materialId: rmAlum.id,
                  quantityPerUnit: 3.5,
                  unitOfMeasure: 'KG',
                  scrapPercentage: 2.5,
                  createdById: adminId,
                },
                {
                  componentType: 'MATERIAL',
                  materialId: rmFast.id,
                  quantityPerUnit: 2.0,
                  unitOfMeasure: 'KIT',
                  scrapPercentage: 1.0,
                  createdById: adminId,
                },
              ],
            },
          },
        },
      },
    });
    console.log(`Seeded BOM: ${bomHeader.name} with 3 lines`);
  }

  // 7. Routing Header & Operations
  const existingRouting = await prisma.routingHeader.findFirst({
    where: {
      organizationId: org.id,
      productId: fgActuator.id,
      plantId: detPlant.id,
      name: 'Actuator Final Assembly Routing',
    },
  });

  if (!existingRouting) {
    const routing = await prisma.routingHeader.create({
      data: {
        organizationId: org.id,
        productId: fgActuator.id,
        plantId: detPlant.id,
        name: 'Actuator Final Assembly Routing',
        description: '3-stage assembly, testing, and packaging',
        isActive: true,
        createdById: adminId,
        versions: {
          create: {
            versionNumber: 1,
            status: 'APPROVED',
            createdById: adminId,
            operations: {
              create: [
                {
                  sequence: 10,
                  operationName: 'Subassembly Integration',
                  workCenter: 'WC-ASSY-01',
                  setupTimeMinutes: 15.0,
                  runTimePerUnitMinutes: 3.5,
                  laborHoursPerUnit: 0.15,
                  machineHoursPerUnit: 0.05,
                  createdById: adminId,
                },
                {
                  sequence: 20,
                  operationName: 'Hydrostatic Pressure Test',
                  workCenter: 'WC-TEST-01',
                  setupTimeMinutes: 10.0,
                  runTimePerUnitMinutes: 2.0,
                  laborHoursPerUnit: 0.08,
                  machineHoursPerUnit: 0.03,
                  createdById: adminId,
                },
                {
                  sequence: 30,
                  operationName: 'Final Packaging & QA',
                  workCenter: 'WC-PACK-01',
                  setupTimeMinutes: 5.0,
                  runTimePerUnitMinutes: 1.5,
                  laborHoursPerUnit: 0.05,
                  machineHoursPerUnit: 0.01,
                  createdById: adminId,
                },
              ],
            },
          },
        },
      },
    });
    console.log(`Seeded Routing: ${routing.name} with 3 sequential operations`);
  }

  // 8. Chart of Accounts
  const parentAccounts = [
    { code: '1000', name: 'Assets', accountType: 'ASSET', normalBalance: 'DEBIT' },
    { code: '2000', name: 'Liabilities', accountType: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '3000', name: 'Equity', accountType: 'EQUITY', normalBalance: 'CREDIT' },
    { code: '4000', name: 'Revenue', accountType: 'REVENUE', normalBalance: 'CREDIT' },
    { code: '5000', name: 'Cost of Goods Sold', accountType: 'COGS', normalBalance: 'DEBIT' },
    { code: '6000', name: 'Operating Expenses', accountType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT' },
  ];

  const accountMap = new Map<string, string>();

  for (const pa of parentAccounts) {
    const acc = await prisma.account.upsert({
      where: { organizationId_code: { organizationId: org.id, code: pa.code } },
      update: {},
      create: {
        organizationId: org.id,
        code: pa.code,
        name: pa.name,
        accountType: pa.accountType,
        normalBalance: pa.normalBalance,
        currency: 'USD',
        isActive: true,
        createdById: adminId,
      },
    });
    accountMap.set(pa.code, acc.id);
  }

  const childAccounts = [
    { code: '1100', name: 'Raw Materials Inventory', parent: '1000', type: 'ASSET', normal: 'DEBIT' },
    { code: '1200', name: 'Work in Process (WIP)', parent: '1000', type: 'ASSET', normal: 'DEBIT' },
    { code: '1300', name: 'Finished Goods Inventory', parent: '1000', type: 'ASSET', normal: 'DEBIT' },
    { code: '4010', name: 'Finished Goods Commercial Sales', parent: '4000', type: 'REVENUE', normal: 'CREDIT' },
    { code: '5010', name: 'Direct Material Expense', parent: '5000', type: 'COGS', normal: 'DEBIT' },
    { code: '5020', name: 'Direct Labor Expense', parent: '5000', type: 'COGS', normal: 'DEBIT' },
    { code: '5030', name: 'Manufacturing Overhead Allocated', parent: '5000', type: 'COGS', normal: 'DEBIT' },
  ];

  for (const ca of childAccounts) {
    await prisma.account.upsert({
      where: { organizationId_code: { organizationId: org.id, code: ca.code } },
      update: {},
      create: {
        organizationId: org.id,
        code: ca.code,
        name: ca.name,
        parentAccountId: accountMap.get(ca.parent),
        accountType: ca.type,
        normalBalance: ca.normal,
        currency: 'USD',
        isActive: true,
        createdById: adminId,
      },
    });
  }

  console.log('Seeded Chart of Accounts hierarchy (6 parents, 7 child accounts)');

  // 9. Fiscal Calendar & 12 Periods
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let cal = await prisma.fiscalCalendar.findFirst({
    where: { organizationId: org.id, name: 'Standard Corporate Calendar' },
    include: { periods: true },
  });

  if (!cal) {
    cal = await prisma.fiscalCalendar.create({
      data: {
        organizationId: org.id,
        name: 'Standard Corporate Calendar',
        fiscalYearStartMonth: 1,
        calendarType: 'MONTHLY',
        status: 'ACTIVE',
        createdById: adminId,
        periods: {
          create: Array.from({ length: 12 }, (_, i) => {
            const pNum = i + 1;
            const q = Math.floor(i / 3) + 1;
            const startDate = new Date(Date.UTC(2026, i, 1, 0, 0, 0));
            const endDate = new Date(Date.UTC(2026, i + 1, 0, 23, 59, 59, 999));
            return {
              fiscalYear: 2026,
              periodNumber: pNum,
              periodName: `FY2026-P${String(pNum).padStart(2, '0')} (${MONTHS[i]})`,
              startDate,
              endDate,
              quarter: q,
              status: 'OPEN',
              createdById: adminId,
            };
          }),
        },
      },
      include: { periods: true },
    });
    console.log(`Seeded Fiscal Calendar with 12 monthly periods for FY2026`);
  }

  // 10. Planning Cycle & Baseline Plan Version
  const existingCycle = await prisma.planningCycle.findFirst({
    where: { organizationId: org.id, name: 'FY2026 Annual Operating Budget' },
    include: { planVersions: true },
  });

  if (!existingCycle) {
    const cycle = await prisma.planningCycle.create({
      data: {
        organizationId: org.id,
        name: 'FY2026 Annual Operating Budget',
        planningType: 'ANNUAL_BUDGET',
        fiscalYear: 2026,
        description: 'Approved manufacturing budget cycle for precision actuator lines',
        status: 'OPEN',
        ownerUserId: plannerId,
        createdById: adminId,
        planVersions: {
          create: [
            {
              organizationId: org.id,
              versionCode: 'V1-BASE',
              versionName: '2026 Operating Plan Baseline',
              versionType: 'BASE_CASE',
              scenarioLabel: 'Baseline',
              description: 'Executive-approved operational budget baseline',
              status: 'APPROVED',
              approvedDate: new Date(),
              ownerUserId: plannerId,
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              versionCode: 'V1-UPSIDE',
              versionName: 'Upside Demand Scenario (+15%)',
              versionType: 'BEST_CASE',
              scenarioLabel: 'Upside +15%',
              description: 'Scenario model assuming expansion in automotive tier 1 customers',
              status: 'DRAFT',
              ownerUserId: plannerId,
              createdById: plannerId,
            },
          ],
        },
      },
      include: { planVersions: true },
    });

    console.log(`Seeded Planning Cycle: ${cycle.name} with ${cycle.planVersions.length} versions`);
  }

  // Retrieve planning cycle, periods, and versions for Phase 3 seeding
  const cycle = await prisma.planningCycle.findFirst({
    where: { organizationId: org.id, name: 'FY2026 Annual Operating Budget' },
    include: { planVersions: true },
  });

  const p1Period = await prisma.fiscalPeriod.findFirst({
    where: { fiscalCalendarId: cal.id, fiscalYear: 2026, periodNumber: 1 },
  });

  if (cycle && p1Period) {
    const baseVersion = cycle.planVersions.find((v) => v.versionCode === 'V1-BASE');
    const upsideVersion = cycle.planVersions.find((v) => v.versionCode === 'V1-UPSIDE');

    if (baseVersion) {
      // 11. Management Targets
      const existingTarget = await prisma.managementTarget.findFirst({
        where: { planVersionId: baseVersion.id, targetMetric: 'REVENUE' },
      });

      if (!existingTarget) {
        await prisma.managementTarget.createMany({
          data: [
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              fiscalPeriodId: p1Period.id,
              targetMetric: 'REVENUE',
              targetValue: 1200000.0,
              unitOfMeasure: 'USD',
              currency: 'USD',
              sourceType: 'APPROVED_BASELINE',
              status: 'APPROVED',
              notes: 'Executive revenue baseline for FY2026 P1',
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              fiscalPeriodId: p1Period.id,
              plantId: detPlant.id,
              productId: fgActuator.id,
              targetMetric: 'SALES_QUANTITY',
              targetValue: 2500.0,
              unitOfMeasure: 'EA',
              sourceType: 'APPROVED_BASELINE',
              status: 'APPROVED',
              notes: 'Target sales unit volume for Detroit primary plant',
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              fiscalPeriodId: p1Period.id,
              targetMetric: 'GROSS_MARGIN_PERCENT',
              targetValue: 42.5,
              unitOfMeasure: 'PERCENT',
              sourceType: 'MANAGEMENT_SUBMISSION',
              status: 'APPROVED',
              notes: 'Minimum corporate target gross margin %',
              createdById: adminId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              fiscalPeriodId: p1Period.id,
              plantId: detPlant.id,
              productId: fgActuator.id,
              targetMetric: 'PRODUCTION_QUANTITY',
              targetValue: 2600.0,
              unitOfMeasure: 'EA',
              sourceType: 'APPROVED_BASELINE',
              status: 'APPROVED',
              notes: 'Target output including buffer inventory',
              createdById: plannerId,
            },
          ],
        });
        console.log('Seeded Phase 3 Management Targets (4 targets)');
      }

      // 12. Assumptions
      const existingAssumption = await prisma.assumption.findFirst({
        where: { planVersionId: baseVersion.id, code: 'INFLATION_RATE_PCT' },
      });

      if (!existingAssumption) {
        await prisma.assumption.createMany({
          data: [
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              code: 'INFLATION_RATE_PCT',
              name: 'Projected Annual Inflation Rate',
              category: 'OTHER',
              valueType: 'PERCENTAGE',
              numericValue: 3.2,
              unit: '%',
              source: 'Federal Reserve Projected CPI',
              confidenceLevel: 'MEDIUM',
              status: 'APPROVED',
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              code: 'ACTUATOR_LIST_PRICE',
              name: 'Commercial Actuator 500 Price',
              category: 'PRICING',
              valueType: 'CURRENCY',
              numericValue: 480.0,
              unit: 'USD',
              productId: fgActuator.id,
              source: 'Commercial Price Book 2026',
              confidenceLevel: 'HIGH',
              status: 'APPROVED',
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              code: 'STEEL_SURCHARGE_PCT',
              name: 'Cold-Rolled Steel Surcharge Index',
              category: 'MATERIAL_COST',
              valueType: 'PERCENTAGE',
              numericValue: 5.0,
              unit: '%',
              source: 'Supplier Index Pricing Agreement',
              confidenceLevel: 'HIGH',
              status: 'APPROVED',
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              code: 'PLANT_DETROIT_HOURLY_WAGE',
              name: 'Detroit Plant Blended Labor Wage',
              category: 'LABOR_COST',
              valueType: 'CURRENCY',
              numericValue: 32.50,
              unit: 'USD/HR',
              plantId: detPlant.id,
              source: 'CBA Labor Agreement 2025-2027',
              confidenceLevel: 'HIGH',
              status: 'APPROVED',
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              code: 'EFFECTIVE_CORP_TAX_PCT',
              name: 'Corporate Effective Income Tax Rate',
              category: 'TAX',
              valueType: 'PERCENTAGE',
              numericValue: 24.5,
              unit: '%',
              source: 'Corporate Tax Advisory FY26 Model',
              confidenceLevel: 'HIGH',
              status: 'APPROVED',
              createdById: adminId,
            },
          ],
        });
        console.log('Seeded Phase 3 Assumptions (5 assumptions across categories)');
      }
    }

    // 13. Global Drivers Library
    const driversData = [
      {
        driverCode: 'DRV-SCRAP-01',
        driverName: 'Standard Production Scrap Rate',
        driverCategory: 'PRODUCTION',
        driverType: 'PERCENTAGE',
        unitOfMeasure: '%',
        defaultValue: 2.0,
      },
      {
        driverCode: 'DRV-OEE-01',
        driverName: 'Machine Overall Equipment Effectiveness',
        driverCategory: 'MACHINE',
        driverType: 'PERCENTAGE',
        unitOfMeasure: '%',
        defaultValue: 85.0,
      },
      {
        driverCode: 'DRV-ELEC-01',
        driverName: 'Industrial Electricity Tariff Rate',
        driverCategory: 'OVERHEAD',
        driverType: 'RATE',
        unitOfMeasure: 'USD/kWh',
        defaultValue: 0.12,
      },
      {
        driverCode: 'DRV-LABOR-01',
        driverName: 'Assembly Skilled Labor Loaded Rate',
        driverCategory: 'LABOR',
        driverType: 'RATE',
        unitOfMeasure: 'USD/Hour',
        defaultValue: 34.00,
      },
      {
        driverCode: 'DRV-PACK-01',
        driverName: 'Unit Packaging & Dunnage Kit Cost',
        driverCategory: 'MATERIAL',
        driverType: 'RATE',
        unitOfMeasure: 'USD/EA',
        defaultValue: 4.50,
      },
    ];

    const driverMap = new Map<string, string>();
    for (const d of driversData) {
      const driver = await prisma.driver.upsert({
        where: {
          organizationId_driverCode: {
            organizationId: org.id,
            driverCode: d.driverCode,
          },
        },
        update: {},
        create: {
          organizationId: org.id,
          driverCode: d.driverCode,
          driverName: d.driverName,
          driverCategory: d.driverCategory,
          driverType: d.driverType,
          unitOfMeasure: d.unitOfMeasure,
          defaultValue: d.defaultValue,
          isActive: true,
          createdById: adminId,
        },
      });
      driverMap.set(d.driverCode, driver.id);
    }
    console.log('Seeded Phase 3 Global Drivers Library (5 drivers)');

    // 14. Plan Driver Value Overrides
    if (upsideVersion && driverMap.has('DRV-OEE-01')) {
      const existingOverride = await prisma.planDriverValue.findFirst({
        where: {
          planVersionId: upsideVersion.id,
          driverId: driverMap.get('DRV-OEE-01')!,
        },
      });

      if (!existingOverride) {
        await prisma.planDriverValue.create({
          data: {
            organizationId: org.id,
            planVersionId: upsideVersion.id,
            driverId: driverMap.get('DRV-OEE-01')!,
            driverValue: 90.0,
            isOverridden: true,
            overrideReason: 'Kaizen automation blitz scheduled for Q1 completion',
            status: 'DRAFT',
            createdById: plannerId,
          },
        });
        console.log('Seeded Phase 3 Plan Driver Override (OEE: 85% -> 90% in Upside)');
      }
    }

    // 15. Unified Plan Inputs
    if (baseVersion) {
      const existingInput = await prisma.planInput.findFirst({
        where: {
          planVersionId: baseVersion.id,
          fiscalPeriodId: p1Period.id,
          inputCode: 'SALES_VOLUME',
        },
      });

      if (!existingInput) {
        await prisma.planInput.createMany({
          data: [
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              fiscalPeriodId: p1Period.id,
              plantId: detPlant.id,
              productId: fgActuator.id,
              inputCategory: 'DEMAND',
              inputCode: 'SALES_VOLUME',
              inputValue: 2500.0,
              unitOfMeasure: 'EA',
              sourceType: 'MANUAL',
              status: 'VALID',
              notes: 'Forecast customer deliveries',
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              fiscalPeriodId: p1Period.id,
              plantId: detPlant.id,
              productId: fgActuator.id,
              inputCategory: 'DEMAND',
              inputCode: 'SELLING_PRICE',
              inputValue: 480.0,
              unitOfMeasure: 'USD',
              sourceType: 'ASSUMPTION',
              status: 'VALID',
              notes: 'Contract list pricing',
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              fiscalPeriodId: p1Period.id,
              plantId: detPlant.id,
              productId: fgActuator.id,
              inputCategory: 'PRODUCTION',
              inputCode: 'PRODUCTION_VOLUME',
              inputValue: 2600.0,
              unitOfMeasure: 'EA',
              sourceType: 'PRIOR_PLAN_VERSION',
              status: 'VALID',
              notes: 'Planned assembly lot',
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              fiscalPeriodId: p1Period.id,
              plantId: detPlant.id,
              productId: fgActuator.id,
              materialId: rmSteel.id,
              inputCategory: 'MATERIAL',
              inputCode: 'RM_USAGE_QTY',
              inputValue: 9100.0,
              unitOfMeasure: 'KG',
              sourceType: 'MANUAL',
              status: 'VALID',
              notes: 'Calculated steel requirement with scrap',
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              fiscalPeriodId: p1Period.id,
              plantId: detPlant.id,
              accountId: accountMap.get('5020'),
              driverId: driverMap.get('DRV-LABOR-01'),
              inputCategory: 'LABOR',
              inputCode: 'LABOR_HOURLY_RATE',
              inputValue: 34.0,
              unitOfMeasure: 'USD/HR',
              sourceType: 'DRIVER',
              status: 'VALID',
              notes: 'Assembly loaded rate from driver library',
              createdById: plannerId,
            },
            {
              organizationId: org.id,
              planningCycleId: cycle.id,
              planVersionId: baseVersion.id,
              fiscalPeriodId: p1Period.id,
              accountId: accountMap.get('6000'),
              inputCategory: 'OPEX',
              inputCode: 'OPEX_PLANNED_AMOUNT',
              inputValue: 25000.0,
              unitOfMeasure: 'USD',
              sourceType: 'MANUAL',
              status: 'VALID',
              notes: 'Period 1 General & Administrative allocation',
              createdById: plannerId,
            },
          ],
        });
        console.log('Seeded Phase 3 Plan Inputs (6 multi-category inputs)');
      }
    }
  }

  // Final Audit Log
  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      action: 'PHASE3_INITIALIZED',
      entityType: 'ORGANIZATION',
      entityId: org.id,
      metadata: JSON.stringify({
        plants: 2,
        products: 2,
        materials: 3,
        boms: 1,
        routings: 1,
        accounts: 13,
        calendarYear: 2026,
        phase3: {
          targetsSeeded: true,
          assumptionsSeeded: true,
          driversSeeded: true,
          inputsSeeded: true,
        },
        note: 'Phase 3 Management Targets, Assumptions, Drivers, and Planning Inputs fully seeded.',
      }),
    },
  });

  console.log('Database seed completed successfully with Phase 3 foundation.');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
