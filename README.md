# ELS Financial Planning — Manufacturing FP&A Platform (MVP)

A multi-tenant SaaS platform engineered specifically for **Manufacturing Financial Planning and Analysis (FP&A)**.

---

## MVP Objective: First Vertical Slice

This platform models the core manufacturing financial chain:
```
Organization → Plant → Product → One Month Horizon → Demand Plan → Production Plan → Costing Model → P&L Statements
```

### Core FP&A Architecture Principles
1. **Deterministic Calculations**: Financial values are calculated strictly using reproducible, fixed-point/integer-scaled arithmetic.
2. **Decoupled Engine**: Financial calculations **never** execute inside React UI components or API controllers. All computation belongs to the isolated domain engine (`src/core/engine/`).
3. **No AI Math**: Stochastic or generative AI models must never calculate or mutate financial planning numbers.
4. **Input / Output Separation**: Plan inputs (demand, machine capacity, labor hours, material rates) and calculated outputs (COGS, gross margin, operating profit) are structurally decoupled.
5. **Multi-Tenancy & Versioning**: Every entity belongs to an `Organization` and `PlanVersion`.
6. **Immutability Lifecycle**: Once a plan version reaches `APPROVED` or `LOCKED`, it cannot be directly edited. Adjustments branch into new versions (`v2`, `v3`).
7. **Complete Audit Trail**: All authentication events, member invitations, role promotions, and manual overrides are cryptographically recorded in the `AuditLog` table.

---

## Phase 1 Deliverables Summary

- **Repository & Environment Setup**: Next.js 14 App Router, TypeScript (strict), Vanilla CSS design tokens.
- **Database & Prisma ORM**: Schema with `User`, `Organization`, `Membership`, `Session`, and `AuditLog` models.
- **Authentication**: Cryptographic database-backed session tokens delivered over secure `httpOnly` cookies, password hashing with `bcryptjs` (salt rounds 12).
- **Multi-Tenancy**: Tenant-scoped data access and organization switcher.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions matrix for `ADMIN`, `PLANNER`, and `REVIEWER`.
- **Base Application Layout**: Responsive sidebar, organization switcher, status badges, and accessible dialogs.
- **Structured Observability**: RFC 7807 compliant error hierarchy (`AppError`) and structured JSON logging with correlation IDs.
- **Automated Test Suite**: 32 automated unit and integration tests (Vitest) validating RBAC, password security, session lifecycles, and multi-tenant isolation.

---

## System Roles & Permissions Matrix

| Capability / Permission | Admin | Planner | Reviewer |
| :--- | :---: | :---: | :---: |
| **Manage Organization Settings** (`ORG_MANAGE_SETTINGS`) | Yes | No | No |
| **Manage Members & Assign Roles** (`ORG_MANAGE_MEMBERS`) | Yes | No | No |
| **View Audit Trail** (`ORG_VIEW_AUDIT`) | Yes | No | No |
| **Create Financial Plan Scenarios** (`PLAN_CREATE`) | Yes | Yes | No |
| **Modify Plan Inputs** (`PLAN_EDIT`) | Yes | Yes | No |
| **Execute Calculation Engine** (`PLAN_CALCULATE`) | Yes | Yes | No |
| **Submit Plan for Formal Review** (`PLAN_SUBMIT_REVIEW`) | Yes | Yes | No |
| **Approve Financial Plan** (`PLAN_APPROVE`) | Yes | No | Yes |
| **Lock Plan Version** (`PLAN_LOCK`) | Yes | No | Yes |
| **View Plans, Costs, & P&L Reports** (`PLAN_VIEW`) | Yes | Yes | Yes |
| **Export Financial Summaries** (`PLAN_EXPORT`) | Yes | Yes | Yes |

---

## Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript 5.6 (Strict Mode)
- **Database**: SQLite (Zero-friction local dev/testing) & PostgreSQL (Production deployment target)
- **ORM**: Prisma ORM 5.22
- **Password Security**: `bcryptjs`
- **Validation**: Zod 3.23
- **Test Runner**: Vitest 2.1
- **Styling**: Modern Vanilla CSS with CSS Custom Properties (Deep navy/slate financial theme)

---

## Environment Variables

Create a `.env` file in the root directory (see `.env.example`):

```env
# Database connection string
# For local development:
DATABASE_URL="file:./dev.db"

# For PostgreSQL production deployment:
# DATABASE_URL="postgresql://username:password@localhost:5432/els_fpa?schema=public"

# Application Security
SESSION_SECRET="e1s-f1nanc1al-p1ann1ng-sec-key-32-chars-minimum"
COOKIE_NAME="els_fpa_session"
NODE_ENV="development"

# Logging Level (debug | info | warn | error)
LOG_LEVEL="info"
```

---

## Getting Started & Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate Prisma Client & Initialize Database
```bash
npx prisma generate
npx prisma db push
```

### 3. Seed Default Test Data
Seeds `Precision Manufacturing Corp` along with test accounts for all 3 roles:
```bash
npm run db:seed
```

#### Seeded Test Credentials:
- **Admin**: `admin@precisionmfg.com` / `Password123!`
- **Planner**: `planner@precisionmfg.com` / `Password123!`
- **Reviewer**: `reviewer@precisionmfg.com` / `Password123!`

### 4. Run Development Server
```bash
npm run dev
```
Navigate to `http://localhost:3000`.

---

## Verification & Quality Gates

Run the automated validation pipeline:

```bash
# 1. Type Checking
npm run type-check

# 2. Linting
npm run lint

# 3. Unit & Integration Tests (32 tests across 5 test suites)
npm test

# 4. Production Build
npm run build
```

---

## Project Structure

```
├── prisma/
│   ├── schema.prisma              # SQLite development schema
│   ├── schema.postgresql.prisma   # PostgreSQL production schema
│   └── seed.ts                    # Seed script with verified roles
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx     # Login with quick demo accounts
│   │   │   └── register/page.tsx  # Register & create organization
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx         # Authenticated layout guard
│   │   │   ├── page.tsx           # Executive FP&A console
│   │   │   ├── organization/
│   │   │   │   └── members/page.tsx # Team & RBAC management
│   │   │   ├── audit/page.tsx     # Audit trail viewer
│   │   │   └── plans/page.tsx     # Vertical slice architecture
│   │   ├── api/
│   │   │   ├── auth/              # Login, register, logout, me
│   │   │   ├── organizations/     # Tenant management & members
│   │   │   └── audit/             # Audit logs query endpoint
│   │   ├── globals.css            # Financial design tokens & styling
│   │   └── layout.tsx             # Root layout with metadata
│   ├── components/
│   │   ├── ui/                    # Button, Input, Select, Card, Badge, Modal, Alert
│   │   └── layout/                # Header, Sidebar
│   ├── core/
│   │   ├── domain/roles.ts        # RBAC roles, permissions, and matrix
│   │   └── errors/AppError.ts     # RFC 7807 typed error classes
│   ├── lib/
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── logger.ts              # Structured JSON logging
│   │   ├── session.ts             # Session tokens & RBAC guards
│   │   ├── password.ts            # Bcrypt hashing & verification
│   │   ├── audit.ts               # Audit trail recorder
│   │   ├── api-handler.ts         # Route wrapper with observability
│   │   └── validations/           # Zod request payload schemas
│   └── server/services/           # Auth, Organization, and Audit services
└── tests/
    ├── unit/                      # RBAC, password, and error tests
    └── integration/               # Auth & Organization lifecycle tests
```
