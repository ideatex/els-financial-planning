import { db } from '@/lib/db';
import { recordAuditLog } from '@/lib/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors/AppError';
import { createFiscalCalendarSchema, updateFiscalPeriodStatusSchema } from '@/lib/validations/master-data';
import { z } from 'zod';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

interface PeriodDefinition {
  fiscalYear: number;
  periodNumber: number;
  periodName: string;
  startDate: Date;
  endDate: Date;
  quarter: number;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
}

function calculatePeriodsForYear(
  fiscalYear: number,
  fiscalYearStartMonth: number
): PeriodDefinition[] {
  const periods: PeriodDefinition[] = [];

  for (let i = 0; i < 12; i++) {
    const periodNumber = i + 1;
    // Month index in calendar (0 = Jan, 11 = Dec)
    const calMonthIndex = (fiscalYearStartMonth - 1 + i) % 12;
    // Cal year: if calendar wraps around into next calendar year
    const calYear = fiscalYearStartMonth === 1 
      ? fiscalYear 
      : (fiscalYearStartMonth - 1 + i >= 12 ? fiscalYear : fiscalYear - 1);

    const startDate = new Date(Date.UTC(calYear, calMonthIndex, 1, 0, 0, 0, 0));
    // Last day of month: next month day 0
    const endDate = new Date(Date.UTC(calYear, calMonthIndex + 1, 0, 23, 59, 59, 999));
    const quarter = Math.floor(i / 3) + 1;
    const monthName = MONTH_NAMES[calMonthIndex];
    const periodStr = String(periodNumber).padStart(2, '0');
    const periodName = `FY${fiscalYear}-P${periodStr} (${monthName})`;

    periods.push({
      fiscalYear,
      periodNumber,
      periodName,
      startDate,
      endDate,
      quarter,
      status: 'OPEN',
    });
  }

  return periods;
}

export async function getFiscalCalendars(orgId: string) {
  return db.fiscalCalendar.findMany({
    where: { organizationId: orgId },
    orderBy: { name: 'asc' },
    include: {
      periods: {
        orderBy: [{ fiscalYear: 'asc' }, { periodNumber: 'asc' }],
      },
      _count: {
        select: { periods: true },
      },
    },
  });
}

export async function getFiscalCalendarById(orgId: string, calendarId: string) {
  const calendar = await db.fiscalCalendar.findFirst({
    where: { id: calendarId, organizationId: orgId },
    include: {
      periods: {
        orderBy: [{ fiscalYear: 'asc' }, { periodNumber: 'asc' }],
      },
    },
  });

  if (!calendar) {
    throw new NotFoundError(`Fiscal calendar with ID '${calendarId}' not found`);
  }

  return calendar;
}

export async function createFiscalCalendar(
  orgId: string,
  userId: string,
  data: z.infer<typeof createFiscalCalendarSchema>
) {
  const validated = createFiscalCalendarSchema.parse(data);

  const existing = await db.fiscalCalendar.findFirst({
    where: {
      organizationId: orgId,
      name: validated.name,
    },
  });

  if (existing) {
    throw new ConflictError(`Fiscal calendar '${validated.name}' already exists in this organization`);
  }

  const generatedPeriods = calculatePeriodsForYear(
    validated.startYear,
    validated.fiscalYearStartMonth
  );

  const calendar = await db.fiscalCalendar.create({
    data: {
      organizationId: orgId,
      name: validated.name,
      fiscalYearStartMonth: validated.fiscalYearStartMonth,
      calendarType: validated.calendarType,
      status: 'ACTIVE',
      createdById: userId,
      periods: {
        create: generatedPeriods.map((p) => ({
          fiscalYear: p.fiscalYear,
          periodNumber: p.periodNumber,
          periodName: p.periodName,
          startDate: p.startDate,
          endDate: p.endDate,
          quarter: p.quarter,
          status: p.status,
          createdById: userId,
        })),
      },
    },
    include: {
      periods: {
        orderBy: [{ fiscalYear: 'asc' }, { periodNumber: 'asc' }],
      },
    },
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'CREATE',
    entityType: 'FiscalCalendar',
    entityId: calendar.id,
    metadata: {
      name: calendar.name,
      fiscalYearStartMonth: calendar.fiscalYearStartMonth,
      startYear: validated.startYear,
      periodCount: calendar.periods.length,
    },
  });

  return calendar;
}

export async function generateAdditionalFiscalYear(
  orgId: string,
  userId: string,
  calendarId: string,
  fiscalYear: number
) {
  const calendar = await getFiscalCalendarById(orgId, calendarId);

  const existingPeriods = await db.fiscalPeriod.findFirst({
    where: {
      fiscalCalendarId: calendarId,
      fiscalYear,
    },
  });

  if (existingPeriods) {
    throw new ConflictError(`Periods for Fiscal Year ${fiscalYear} already exist in this calendar`);
  }

  const periods = calculatePeriodsForYear(fiscalYear, calendar.fiscalYearStartMonth);

  await db.fiscalPeriod.createMany({
    data: periods.map((p) => ({
      fiscalCalendarId: calendarId,
      fiscalYear: p.fiscalYear,
      periodNumber: p.periodNumber,
      periodName: p.periodName,
      startDate: p.startDate,
      endDate: p.endDate,
      quarter: p.quarter,
      status: p.status,
      createdById: userId,
    })),
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'UPDATE',
    entityType: 'FiscalCalendar',
    entityId: calendarId,
    metadata: { addedFiscalYear: fiscalYear, periodsGenerated: periods.length },
  });

  return getFiscalCalendarById(orgId, calendarId);
}

export async function updatePeriodStatus(
  orgId: string,
  userId: string,
  periodId: string,
  data: z.infer<typeof updateFiscalPeriodStatusSchema>
) {
  const validated = updateFiscalPeriodStatusSchema.parse(data);

  const period = await db.fiscalPeriod.findFirst({
    where: {
      id: periodId,
      fiscalCalendar: { organizationId: orgId },
    },
    include: {
      fiscalCalendar: true,
    },
  });

  if (!period) {
    throw new NotFoundError(`Fiscal period with ID '${periodId}' not found`);
  }

  if (period.status === 'LOCKED' && validated.status !== 'LOCKED') {
    throw new ValidationError('A locked fiscal period cannot be reopened directly without administrative unlock');
  }

  const oldStatus = period.status;
  const updateData: { status: string; updatedById: string; closedDate?: Date | null } = {
    status: validated.status,
    updatedById: userId,
  };

  if (validated.status === 'CLOSED' || validated.status === 'LOCKED') {
    updateData.closedDate = new Date();
  } else if (validated.status === 'OPEN') {
    updateData.closedDate = null;
  }

  const updated = await db.fiscalPeriod.update({
    where: { id: periodId },
    data: updateData,
  });

  await recordAuditLog({
    organizationId: orgId,
    userId,
    action: 'UPDATE',
    entityType: 'FiscalPeriod',
    entityId: periodId,
    metadata: { oldStatus, newStatus: validated.status },
  });

  return updated;
}
