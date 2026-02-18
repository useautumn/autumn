# autumn-js Remaining Work

This document tracks features from the old `libraries/` folder that were deleted during the v2 migration and need to be reimplemented.

## React Client (`src/react/`) - Partially Reimplemented

### Completed
- [x] `AutumnProvider` - Migrated to TanStack Query
- [x] `useCustomer` - Reimplemented with TanStack Query
- [x] `useListPlans` - New hook for listing plans

### Not Yet Reimplemented

#### Hooks
- [ ] `usePricingTable` - Fetches products with display information, used by vite app
- [ ] `useEntity` - Fetches entity data by ID
- [ ] `useAutumn` - Provides imperative methods (attach, track, cancel, checkout, etc.)

#### useAutumn Methods (from old `useAutumnBase.tsx`)
- [ ] `attach(params)` - Attach a product to customer, with optional dialog support
- [ ] `checkout(params)` - Create checkout session, with optional dialog support  
- [ ] `track(params)` - Track usage event
- [ ] `cancel(params)` - Cancel subscription
- [ ] `openBillingPortal(params)` - Open Stripe billing portal
- [ ] `setupPayment(params)` - Setup payment method

#### Dialog System (DEPRECATED - Do not reimplement)
- ~~AttachDialog~~ - Deprecated
- ~~PaywallDialog~~ - Deprecated
- ~~CheckoutDialog~~ - Deprecated
- ~~PricingTable component~~ - Deprecated

#### Types/Utilities
- [ ] `ProductDetails` type - Product with display information
- [ ] `compareParams` utility - For SWR cache comparison (may not be needed with TanStack Query)

## Backend (`src/backend/`) - Reimplemented

The new backend is in `src/backend/` and uses RPC-style routes.

### Deleted (Old System)
The entire `libraries/backend/` folder was deleted:
- [x] `next.ts` - Replaced by `src/backend/adapters/next.ts`
- [x] `hono.ts` - Replaced by `src/backend/adapters/hono.ts`
- [x] `express.ts` - Not reimplemented
- [x] `fastify.ts` - Not reimplemented
- [x] `elysia.ts` - Not reimplemented
- [x] `supabase.ts` - Not reimplemented
- [x] `tanstack.ts` - Not reimplemented
- [x] `react-router.ts` - Not reimplemented
- [x] `routes/` folder - Superseded by `src/backend/core/routes/`
- [x] `utils/` folder - Superseded by `src/backend/core/handlers/`

### Better Auth Integration (DELETED - Needs Reimplementation)
- [ ] `better-auth.ts` - Better Auth plugin was deleted, needs to be reimplemented using new `src/backend/` route system
- [ ] `utils/betterAuth/middlewares.ts` - Organization/identity context helpers
- [ ] `utils/betterAuth/types.ts` - AutumnOptions type for Better Auth

## Backend Routes Not Yet Implemented

The new RPC-based backend (`src/backend/`) currently supports:
- [x] `customers.get_or_create`
- [x] `billing.attach`
- [x] `billing.setup_payment`
- [x] `balances.check`
- [x] `balances.track`
- [x] `plans.list`

### Not Yet Implemented
- [ ] `billing.checkout` - Create checkout session
- [ ] `billing.cancel` - Cancel subscription
- [ ] `billing.portal` - Open billing portal
- [ ] `entities.create` - Create entity
- [ ] `entities.get` - Get entity by ID
- [ ] `entities.delete` - Delete entity
- [ ] `referrals.create_code` - Create referral code
- [ ] `referrals.redeem` - Redeem referral code
- [ ] `events.list` - List customer events

## Types (Deleted)

- [x] `CustomerData` schema/type was deleted - Available from `@useautumn/sdk` as `CustomerData`

## Vite App Compatibility

The vite app currently imports from `autumn-js/react` expecting:
- `AutumnProvider` ✅ (available in new location)
- `useCustomer` ✅ (available in new location)
- `usePricingTable` ❌ (not yet reimplemented)

### Required for Vite App
1. Either reimplement `usePricingTable` or update vite app to use alternative
2. Ensure `autumn-js/react` export path resolves correctly

## Priority Order

1. **High**: Fix vite build errors (update imports or reimplement `usePricingTable`)
2. **High**: Delete old backend files (except better-auth)
3. **Medium**: Implement remaining backend routes
4. **Medium**: Implement `useAutumn` hook with imperative methods
5. **Low**: Migrate better-auth to new route system
6. **Low**: Implement entity/referral hooks if needed
