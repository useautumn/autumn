# Express to Hono Migration Summary

## Quick Stats

### ✅ Migrated (Hono)
- **12 major route groups** fully migrated
- **~80+ endpoints** on Hono

### 🚨 Remaining (Express)
- **24 route groups** still on Express
- **~100+ endpoints** to migrate

---

## What's Already Migrated ✅

### Core API (v1)
- Balances
- Migrations  
- Entities
- Customers (most routes)
- Products/Plans (most routes)
- Features
- Platform Beta
- Organization (partial - CRUD operations)
- Billing

### Internal/Dashboard
- Products (detail/count routes)
- Customers (detail/referrals routes)

### Webhooks
- Vercel webhooks
- Connect webhooks

---

## What Still Needs Migration 🚨

### Critical API Routes
```
/v1/attach              # Attach products to customers
/v1/attach/preview      # Preview attachment
/v1/checkout            # Checkout flow
/v1/cancel              # Cancel/expire products
/v1/invoices            # Invoice operations
/v1/components          # Pricing table, etc.
```

### Rewards & Referrals
```
/v1/rewards             # CRUD for rewards/coupons
/v1/reward_programs     # CRUD for reward programs
/v1/referrals           # Get referral codes, redeem
/v1/redemptions         # Get redemption info
```

### Platform & Analytics
```
/v1/platform            # Platform API (legacy)
/query                  # Analytics queries
```

### Internal/Dashboard
```
/organization           # Org management (partial)
/products               # Product management (partial)
/customers              # Customer management (partial)
/dev                    # API keys, OTP, CLI
/saved_views            # Saved view CRUD
/trmnl                  # TRMNL integration
/admin                  # Admin operations
/users                  # User management
/onboarding             # Onboarding flow
```

### Webhooks
```
/webhooks/stripe        # Stripe webhooks
/webhooks/autumn        # Autumn webhooks
```

### Special Routes
```
GET  /invoices/hosted_invoice_url/:invoiceId  # Invoice redirects
POST /api/autumn                               # Autumn SDK handler
POST /demo/api/autumn                          # Demo Autumn handler
```

---

## Migration Strategy

### Phase 1: Critical API Routes (Priority 1)
Target: **Core billing & product operations**
- [ ] `/v1/attach` endpoints
- [ ] `/v1/cancel` endpoint
- [ ] `/v1/invoices` endpoints
- [ ] `/v1/components` endpoints

### Phase 2: Features & Extensions (Priority 2)
Target: **Rewards, referrals, platform**
- [ ] `/v1/rewards` endpoints
- [ ] `/v1/reward_programs` endpoints
- [ ] `/v1/referrals` endpoints
- [ ] `/v1/redemptions` endpoints
- [ ] `/v1/platform` (legacy) endpoints

### Phase 3: Internal/Dashboard (Priority 3)
Target: **Dashboard functionality**
- [ ] Complete `/organization` migration
- [ ] Complete `/products` migration
- [ ] Complete `/customers` migration
- [ ] `/query` analytics endpoints
- [ ] `/saved_views` endpoints
- [ ] `/dev` endpoints

### Phase 4: System & Admin (Priority 4)
Target: **Admin, auth, system routes**
- [ ] `/admin` endpoints
- [ ] `/users` endpoints
- [ ] `/onboarding` endpoints
- [ ] `/trmnl` endpoints
- [ ] Special routes (Autumn SDK handlers, etc.)

### Phase 5: Webhooks (Priority 5)
Target: **External webhook handlers**
- [ ] `/webhooks/stripe` 
- [ ] `/webhooks/autumn`

---

## Key Migration Challenges

### 1. Authentication Differences
- **Express:** `withAuth`, `withOrgAuth`, `withAdminAuth` middleware
- **Hono:** `betterAuthMiddleware`, `secretKeyMiddleware`
- Need to ensure consistent auth behavior

### 2. Middleware Migration
Each Express router has its own middleware stack:
- `apiAuthMiddleware`
- `pricingMiddleware`
- `analyticsMiddleware`
- `expressApiVersionMiddleware`
- `refreshCacheMiddleware`

These need Hono equivalents (most already exist in `honoMiddlewares/`)

### 3. Rate Limiting
- Express uses `express-rate-limit`
- Need Hono rate limiting solution

### 4. Raw Body Handling
- Webhook routes use `express.raw({ type: "application/json" })`
- Need to handle raw body in Hono for webhook signature verification

### 5. Special Integrations
- Autumn SDK handler (uses `autumnHandler` from `autumn-js/express`)
- Need to find/create Hono equivalent

---

## Testing Strategy

For each migrated route:
1. ✅ Unit tests for handler logic
2. ✅ Integration tests for full request flow
3. ✅ Authentication/authorization tests
4. ✅ Error handling tests
5. ✅ Backward compatibility (if needed)

---

## Resources

- **Full detailed list:** See `EXPRESS_TO_HONO_MIGRATION.md`
- **Hono middleware:** `/server/src/honoMiddlewares/`
- **Hono routers:** Various `*Router.ts` files using `new Hono<HonoEnv>()`
- **Init file:** `/server/src/initHono.ts`

---

## Progress Tracking

Last updated: 2024-11-18

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: Critical API | 🚧 In Progress | 0% |
| Phase 2: Features | ⏳ Not Started | 0% |
| Phase 3: Internal | 🚧 Partial | 30% |
| Phase 4: System | ⏳ Not Started | 0% |
| Phase 5: Webhooks | ⏳ Not Started | 0% |

**Overall Migration:** ~45% complete (estimated)

