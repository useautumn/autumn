# Express to Hono Migration Tracker

This document tracks all Express endpoints in the codebase and their migration status to Hono.

## ✅ Already Migrated to Hono

Based on `initHono.ts`, the following routes are already using Hono:

### API Routes (v1)
- `/v1/balances/*` - `balancesRouter` (Hono)
- `/v1/migrations` - `migrationRouter` (Hono)
- `/v1/entities/*` - `entityRouter` (Hono)
- `/v1/customers/*` - `cusRouter` (Hono)
- `/v1/products_beta/*` - `honoProductBetaRouter` (Hono)
- `/v1/products/*` - `honoProductRouter` (Hono)
- `/v1/plans/*` - `honoProductRouter` (Hono)
- `/v1/features/*` - `featureRouter` (Hono)
- `/v1/platform/*` - `platformBetaRouter` (Hono)
- `/v1/platform/beta/*` - `platformBetaRouter` (Hono)
- `/v1/organization/*` - `honoOrgRouter` (Hono)
- `/v1/billing/*` - `billingRouter` (Hono)

### Internal/Dashboard Routes
- `/products/*` - `internalProductRouter` (Hono) - With betterAuthMiddleware
- `/customers/*` - `internalCusRouter` (Hono) - With betterAuthMiddleware

### Webhooks
- `/webhooks/connect/:env` - `handleConnectWebhook` (Hono)
- `/webhooks/vercel/*` - `vercelWebhookRouter` (Hono)

### Other
- `/stripe/oauth_callback` - `handleOAuthCallback` (Hono)
- `/` - Health check (Hono)

---

## 🚨 Still on Express - Needs Migration

### 1. Main Router (`/` - mainRouter.ts)

**Express Endpoints:**
```
GET    /                          # Hello World endpoint
POST   /organization              # handlePostOrg (withAuth)
```

**Sub-routers:**
- `/admin` - adminRouter (withAdminAuth)
- `/users` - userRouter (withAuth)
- `/onboarding` - onboardingRouter (withOrgAuth)
- `/organization` - orgRouter (withOrgAuth)
- `/products` - expressProductRouter (withOrgAuth)
- `/dev` - devRouter
- `/customers` - cusRouter (withOrgAuth)
- `/query` - analyticsRouter (withOrgAuth)
- `/saved_views` - viewsRouter (withOrgAuth)
- `/trmnl` - trmnlRouter

**Special Routes:**
```
GET    /invoices/hosted_invoice_url/:invoiceId  # Rate limited (10/min)
POST   /api/autumn                                # Autumn SDK handler (withOrgAuth)
POST   /demo/api/autumn                           # Demo Autumn handler (withOrgAuth)
```

---

### 2. Admin Router (`/admin` - adminRouter.ts)

**Middleware:** withAdminAuth

**Endpoints:**
```
GET    /admin/users               # Search users with pagination
GET    /admin/orgs                # Search orgs with pagination
```

---

### 3. User Router (`/users` - userRouter.ts)

**Middleware:** withAuth

**Endpoints:**
```
GET    /users                     # Get current user info
```

---

### 4. Onboarding Router (`/onboarding` - onboardingRouter.ts)

**Middleware:** withOrgAuth

**Endpoints:**
```
POST   /onboarding                # Create products/features from chat result
```

---

### 5. Organization Router (`/organization` - orgRouter.ts)

**Middleware:** withOrgAuth

**Express Endpoints (NOT migrated):**
```
GET    /organization/members      # handleGetOrgMembers
POST   /organization/remove-member # handleRemoveMember
GET    /organization/upload_url   # handleGetUploadUrl
GET    /organization/invites      # handleGetInvites
DELETE /organization              # handleDeleteOrg
DELETE /organization/delete-user  # Delete user (returns success)
GET    /organization              # handleGetOrg
```

**Note:** This router has both Express and Hono versions. The Hono version (`honoOrgRouter`) has:
- PATCH `/organization` - handleUpdateOrg
- GET `/organization/stripe` - handleGetStripeAccount
- DELETE `/organization/stripe` - handleDeleteStripe
- POST `/organization/stripe` - handleConnectStripe
- GET `/organization/stripe/oauth_url` - handleGetOAuthUrl
- POST `/organization/reset_default_account` - handleResetDefaultAccount
- PATCH `/organization/vercel` - handleUpsertVercelConfig
- GET `/organization/vercel_sink` - handleGetVercelSink

---

### 6. Products Router (Internal) (`/products` - internalProductRouter.ts)

**Middleware:** withOrgAuth

**Express Endpoints:**
```
GET    /products/products         # List all products
GET    /products/product_counts   # Get counts for all products
GET    /products/features         # Get all features
GET    /products/rewards          # Get rewards and reward programs
GET    /products/migrations       # Get list of migrations
GET    /products/data             # Get all product data (GET)
POST   /products/data             # Get all product data with filters (POST)
POST   /products/product_options  # Get product options
GET    /products/:productId/info  # handleGetProductDeleteInfo
GET    /products/rewards          # Get rewards
GET    /products/has_entity_feature_id # Check if has entity feature ID
GET    /products/counts           # Get product counts with filters
```

**Hono Endpoints (already migrated):**
```
GET    /products/:productId/count  # handleGetProductCount
GET    /products/:productId/data   # handleGetProductInternal
POST   /products/copy_to_production # handleCopyEnvironment
```

---

### 7. Dev Router (`/dev` - devRouter.ts)

**Endpoints:**
```
GET    /dev/data                  # Get API keys, org, svix dashboard URL (withOrgAuth)
POST   /dev/api_key               # Create API key (withOrgAuth)
DELETE /dev/api_key/:id           # Delete API key (withOrgAuth)
POST   /dev/otp                   # handleCreateOtp (withOrgAuth)
GET    /dev/otp/:otp              # handleGetOtp
POST   /dev/cli/stripe            # Update Stripe keys from CLI
```

---

### 8. Customers Router (Internal) (`/customers` - internalCusRouter.ts)

**Middleware:** withOrgAuth

**Express Endpoints:**
```
POST   /customers/all/search                      # Search customers
GET    /customers/:customer_id/events             # Get customer events
POST   /customers/all/full_customers              # Get full customers
GET    /customers/:customer_id/product/:product_id # Get customer product
```

**Hono Endpoints (already migrated):**
```
GET    /customers/:customer_id                    # handleGetCustomerInternal
GET    /customers/:customer_id/referrals          # handleGetCusReferrals
```

---

### 9. Analytics Router (`/query` - analyticsRouter.ts)

**Middleware:** withOrgAuth

**Endpoints:**
```
GET    /query/event_names         # Get top event names
POST   /query/events              # Query events by customer ID
POST   /query/raw                 # Query raw events by customer ID
```

---

### 10. Saved Views Router (`/saved_views` - savedViewsRouter.ts)

**Middleware:** withOrgAuth

**Endpoints:**
```
POST   /saved_views/save          # ViewsService.saveView
GET    /saved_views               # ViewsService.getViews
DELETE /saved_views/:viewId       # ViewsService.deleteView
```

---

### 11. TRMNL Router (`/trmnl` - trmnlRouter.ts)

**Endpoints:**
```
GET    /trmnl/device_id           # Get TRMNL config (withOrgAuth)
POST   /trmnl/device_id           # Save TRMNL device ID (withOrgAuth)
POST   /trmnl/screen              # Generate TRMNL screen (trmnlLimiter + trmnlAuthMiddleware)
```

---

### 12. API Router (`/v1` - apiRouter.ts)

**Middleware Chain:**
- apiAuthMiddleware
- pricingMiddleware
- analyticsMiddleware
- expressApiVersionMiddleware
- refreshCacheMiddleware

**Sub-routers still on Express:**
```
/v1/invoices             # invoiceRouter
/v1/components           # componentRouter
/v1/rewards              # rewardRouter
/v1/reward_programs      # rewardProgramRouter
/v1/referrals            # referralRouter
/v1/redemptions          # redemptionRouter
/v1                      # attachRouter
/v1/cancel               # cancelRouter
/v1/query                # analyticsRouter (duplicate of /query)
/v1/platform             # platformRouter
/v1/products             # expressProductRouter
/v1/customers            # expressCusRouter
```

**Endpoints:**
```
GET    /v1/organization           # handleGetOrg
```

---

### 13. Invoice Router (`/v1/invoices` - invoiceRouter.ts)

**Endpoints:**
```
GET    /v1/invoices/:stripe_invoice_id/stripe  # Get Stripe invoice
```

---

### 14. Component Router (`/v1/components` - componentRouter.ts)

**Endpoints:**
```
GET    /v1/components/pricing_table  # Get pricing table
```

---

### 15. Reward Router (`/v1/rewards` - rewardRouter.ts)

**Endpoints:**
```
POST   /v1/rewards                # handleCreateCoupon
DELETE /v1/rewards/:id            # handleDeleteCoupon
POST   /v1/rewards/:internalId    # handleUpdateCoupon
GET    /v1/rewards/:id            # handleGetCoupon
```

---

### 16. Reward Program Router (`/v1/reward_programs` - rewardProgramRouter.ts)

**Endpoints:**
```
POST   /v1/reward_programs        # handleCreateRewardProgram
DELETE /v1/reward_programs/:id    # handleDeleteRewardProgram
PUT    /v1/reward_programs/:id    # Update reward program
```

---

### 17. Referral Router (`/v1/referrals` - referralRouter.ts)

**Endpoints:**
```
POST   /v1/referrals/code         # handleGetReferralCode
POST   /v1/referrals/redeem       # handleRedeemReferral
```

---

### 18. Redemption Router (`/v1/redemptions` - redemptionRouter.ts)

**Endpoints:**
```
GET    /v1/redemptions/:redemptionId  # handleGetRedemption
```

---

### 19. Attach Router (`/v1` - attachRouter.ts)

**Endpoints:**
```
POST   /v1/attach                 # handleAttach
POST   /v1/attach/preview         # handleAttachPreview
POST   /v1/checkout               # handleCheckout
```

---

### 20. Cancel Router (`/v1/cancel` - cancelRouter.ts)

**Endpoints:**
```
POST   /v1/cancel                 # Cancel/expire customer product
```

---

### 21. Platform Router (`/v1/platform` - platformRouter.ts)

**Middleware:** platformAuthMiddleware

**Endpoints:**
```
POST   /v1/platform/exchange      # Exchange platform credentials
```

**Note:** There's also a `/v1/platform/beta` route that's already migrated to Hono

---

### 22. Products Router (API) (`/v1/products` - productRouter.ts)

**Express Endpoints:**
```
GET    /v1/products/:product_id/has_customers  # handlePlanHasCustomers
```

**Note:** Most product routes are already migrated to Hono via `honoProductRouter`

---

### 23. Customers Router (API) (`/v1/customers` - cusRouter.ts)

**Express Endpoints:**
```
GET    /v1/customers/:customer_id/billing_portal  # handleGetBillingPortal
```

**Note:** Most customer routes are already migrated to Hono via `cusRouter` (Hono)

---

### 24. Webhooks Router (`/webhooks` - webhooksRouter.ts)

**Endpoints:**
```
POST   /webhooks/stripe/:orgId/:env     # stripeWebhookRouter
POST   /webhooks/autumn                  # autumnWebhookRouter
```

**Note:** Vercel webhooks are already migrated to Hono

---

## Migration Priority

### High Priority (Core API)
1. ✅ `/v1/attach` - attachRouter
2. ✅ `/v1/cancel` - cancelRouter
3. `/v1/invoices` - invoiceRouter
4. `/v1/components` - componentRouter

### Medium Priority (Features)
5. `/v1/rewards` - rewardRouter
6. `/v1/reward_programs` - rewardProgramRouter
7. `/v1/referrals` - referralRouter
8. `/v1/redemptions` - redemptionRouter
9. `/v1/platform` - platformRouter (legacy)

### Lower Priority (Internal/Dashboard)
10. `/organization` - orgRouter (Express parts)
11. `/products` - expressProductRouter (Express parts)
12. `/customers` - cusRouter (Express parts)
13. `/query` - analyticsRouter
14. `/saved_views` - viewsRouter
15. `/dev` - devRouter
16. `/trmnl` - trmnlRouter

### Admin/System
17. `/admin` - adminRouter
18. `/users` - userRouter
19. `/onboarding` - onboardingRouter
20. Main router special routes (Autumn SDK handlers, invoice URL)

### Webhooks
21. `/webhooks/stripe` - stripeWebhookRouter
22. `/webhooks/autumn` - autumnWebhookRouter

---

## Notes

- **Authentication patterns differ:** Express uses `withAuth`, `withOrgAuth`, `withAdminAuth` middleware, while Hono uses `betterAuthMiddleware` and `secretKeyMiddleware`
- **Some routers are hybrid:** They have both Express and Hono implementations (e.g., orgRouter, productRouter, cusRouter)
- **Middleware migration:** Each Express router has specific middleware that needs to be converted to Hono middleware equivalents
- **Rate limiting:** Some routes use `express-rate-limit` which needs Hono equivalents
- **Special handlers:** Routes like Autumn SDK integration and invoice redirects need careful consideration

---

## Checklist for Each Migration

When migrating an Express route to Hono:

- [ ] Convert route handler from Express format to Hono format
- [ ] Migrate middleware (auth, validation, etc.)
- [ ] Update error handling (use `RecaseError` consistently)
- [ ] Test authentication flow
- [ ] Update `initHono.ts` to include the new route
- [ ] Remove or mark deprecated in Express router
- [ ] Update tests
- [ ] Update API documentation

