/**
 * TDD test for writable `purchase_limit.count` on customers.update.
 *
 * Contract under test:
 *   New types/fields:
 *     - billing_controls.auto_topups[].purchase_limit.count?: number (min 0)
 *       on customer create/update params only
 *     - next_reset_at / source remain response-only
 *
 *   New behaviors:
 *     - count: N → writes auto_topup_limit_states.purchase_count = N
 *       for (customer, feature_id)
 *     - omit count → leave runtime state unchanged
 *     - count > limit → 400
 *     - purchase_limit with only count (no interval/limit) → 400
 *     - count: 0 on active window → preserve purchase_window_ends_at
 *     - count > 0 with stale/missing window → init future window so expand
 *       does not project the written count back to 0
 *     - count is stripped before JSONB write (never on customers.auto_topups)
 *
 *   Side effects:
 *     - upserts/updates auto_topup_limit_states row
 *     - still replaces customers.auto_topups config as today
 *
 * Pre-impl red: every assertion below fails because customers.update ignores
 * count (zod strips it) and never touches auto_topup_limit_states.
 * Post-impl green: sync helper writes purchase_count (+ window when needed)
 * and strips count from JSONB storage.
 *
 * Note: this file avoids initScenario/Stripe — this cloud env has no
 * STRIPE_SANDBOX_SECRET_KEY. Customer create/update + direct limit-state
 * inserts are enough to cover the contract.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	ApiVersion,
	AppEnv,
	CustomerExpand,
	ErrCode,
	PurchaseLimitInterval,
} from "@autumn/shared";
import { makeAutoTopupConfig } from "@tests/integration/balances/auto-topup/utils/makeAutoTopupConfig";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import chalk from "chalk";
import { initDrizzle } from "@/db/initDrizzle.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { autoTopupLimitRepo } from "@/internal/balances/autoTopUp/repos";
import { CusService } from "@/internal/customers/CusService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { generateId } from "@/utils/genUtils.js";

type ExpandedPurchaseLimit = {
	interval: PurchaseLimitInterval | null;
	interval_count: number | null;
	limit: number | null;
	count: number;
	next_reset_at: number;
};

const createClients = async () => {
	// Prefer TESTS_ORG when present; fall back so this file can run in the
	// Cursor cloud VM where createTestContext fails without Stripe secrets
	// (preload only builds the default ctx when TESTS_ORG is set).
	const orgSlug = process.env.TESTS_ORG || "unit-test-org";
	const orgSecretKey = process.env.UNIT_TEST_AUTUMN_SECRET_KEY;
	if (!orgSecretKey) throw new Error("UNIT_TEST_AUTUMN_SECRET_KEY is required");

	const { db } = initDrizzle();
	const org = await OrgService.getBySlug({ db, slug: orgSlug });
	if (!org) throw new Error(`Org ${orgSlug} not found`);

	const ctx = {
		db,
		org,
		env: AppEnv.Sandbox,
	} as AutumnContext;

	const autumn = new AutumnInt({
		version: ApiVersion.V2_2,
		secretKey: orgSecretKey,
	});

	return { autumn, ctx, org };
};

const ensureCustomer = async ({
	autumn,
	customerId,
}: {
	autumn: AutumnInt;
	customerId: string;
}) => {
	try {
		await autumn.customers.delete(customerId);
	} catch {
		// ignore missing
	}

	await autumn.customers.create({
		id: customerId,
		name: customerId,
		email: `${customerId}@example.com`,
	});
};

const getExpandedPurchaseLimit = async ({
	autumn,
	customerId,
}: {
	autumn: AutumnInt;
	customerId: string;
}) => {
	const customer = await autumn.customers.get<ApiCustomerV5>(customerId, {
		expand: [CustomerExpand.AutoTopupsPurchaseLimit],
		skip_cache: "true",
	});
	return customer.billing_controls?.auto_topups?.[0]?.purchase_limit as
		| ExpandedPurchaseLimit
		| undefined;
};

test.concurrent(
	`${chalk.yellowBright("customers.update: purchase_limit.count writes runtime state")}`,
	async () => {
		const customerId = "atu-pl-count-write";
		const { autumn, ctx, org } = await createClients();
		await ensureCustomer({ autumn, customerId });

		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: org.id,
			env: ctx.env,
		});
		if (!customer) throw new Error("customer missing after create");

		await autumn.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 50,
				quantity: 100,
				purchaseLimit: { interval: PurchaseLimitInterval.Month, limit: 5 },
			}),
		});

		const activeWindowEndsAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
		const now = Date.now();
		await autoTopupLimitRepo.insert({
			ctx,
			data: {
				id: generateId("atlim"),
				internal_customer_id: customer.internal_id,
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				purchase_window_ends_at: activeWindowEndsAt,
				purchase_count: 4,
				attempt_window_ends_at: now,
				attempt_count: 0,
				failed_attempt_window_ends_at: now,
				failed_attempt_count: 0,
				updated_at: now,
			},
		});

		// ── Contract 1: count: 0 resets purchase_count and preserves window ─
		await autumn.customers.update(customerId, {
			billing_controls: {
				auto_topups: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						threshold: 50,
						quantity: 100,
						purchase_limit: {
							interval: PurchaseLimitInterval.Month,
							interval_count: 1,
							limit: 5,
							count: 0,
						},
					},
				],
			},
		});

		const afterReset = await getExpandedPurchaseLimit({
			autumn,
			customerId,
		});
		expect(afterReset).toMatchObject({
			interval: PurchaseLimitInterval.Month,
			interval_count: 1,
			limit: 5,
			count: 0,
		});
		expect(afterReset?.next_reset_at).toBe(activeWindowEndsAt);

		// ── Contract 2: omit count → leave runtime state unchanged ─────────
		await autumn.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 40,
				quantity: 100,
				purchaseLimit: { interval: PurchaseLimitInterval.Month, limit: 5 },
			}),
		});

		const afterOmit = await getExpandedPurchaseLimit({
			autumn,
			customerId,
		});
		expect(afterOmit).toMatchObject({
			count: 0,
			next_reset_at: activeWindowEndsAt,
		});

		// ── Contract 3: count is not persisted on customers.auto_topups JSONB
		const dbCustomer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: org.id,
			env: ctx.env,
		});
		const storedPurchaseLimit = dbCustomer?.auto_topups?.[0]?.purchase_limit as
			| Record<string, unknown>
			| undefined;
		expect(storedPurchaseLimit).toEqual({
			interval: PurchaseLimitInterval.Month,
			interval_count: 1,
			limit: 5,
		});
		expect(storedPurchaseLimit).not.toHaveProperty("count");

		// ── Contract 4: count > limit → 400 ────────────────────────────────
		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			func: async () =>
				await autumn.customers.update(customerId, {
					billing_controls: {
						auto_topups: [
							{
								feature_id: TestFeature.Messages,
								enabled: true,
								threshold: 50,
								quantity: 100,
								purchase_limit: {
									interval: PurchaseLimitInterval.Month,
									interval_count: 1,
									limit: 5,
									count: 6,
								},
							},
						],
					},
				}),
		});

		// ── Contract 5: purchase_limit with only count → 400 (zod) ─────────
		await expectAutumnError({
			func: async () =>
				await autumn.customers.update(customerId, {
					billing_controls: {
						auto_topups: [
							{
								feature_id: TestFeature.Messages,
								enabled: true,
								threshold: 50,
								quantity: 100,
								purchase_limit: {
									count: 0,
								} as unknown as {
									interval: PurchaseLimitInterval;
									limit: number;
									count: number;
								},
							},
						],
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("customers.update: purchase_limit.count re-inits stale window")}`,
	async () => {
		const customerId = "atu-pl-count-stale";
		const { autumn, ctx, org } = await createClients();
		await ensureCustomer({ autumn, customerId });

		const customer = await CusService.get({
			db: ctx.db,
			idOrInternalId: customerId,
			orgId: org.id,
			env: ctx.env,
		});
		if (!customer) throw new Error("customer missing after create");

		await autumn.customers.update(customerId, {
			billing_controls: makeAutoTopupConfig({
				threshold: 50,
				quantity: 100,
				purchaseLimit: { interval: PurchaseLimitInterval.Month, limit: 5 },
			}),
		});

		const staleWindowEndsAt = Date.now() - 6 * 24 * 60 * 60 * 1000;
		const now = Date.now();
		await autoTopupLimitRepo.insert({
			ctx,
			data: {
				id: generateId("atlim"),
				internal_customer_id: customer.internal_id,
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				purchase_window_ends_at: staleWindowEndsAt,
				purchase_count: 3,
				attempt_window_ends_at: now,
				attempt_count: 0,
				failed_attempt_window_ends_at: now,
				failed_attempt_count: 0,
				updated_at: now,
			},
		});

		// ── Contract 6: count > 0 on stale window → persist count + future window
		await autumn.customers.update(customerId, {
			billing_controls: {
				auto_topups: [
					{
						feature_id: TestFeature.Messages,
						enabled: true,
						threshold: 50,
						quantity: 100,
						purchase_limit: {
							interval: PurchaseLimitInterval.Month,
							interval_count: 1,
							limit: 5,
							count: 2,
						},
					},
				],
			},
		});

		const expanded = await getExpandedPurchaseLimit({
			autumn,
			customerId,
		});
		expect(expanded).toMatchObject({
			interval: PurchaseLimitInterval.Month,
			interval_count: 1,
			limit: 5,
			count: 2,
		});
		expect(expanded?.next_reset_at).toBeGreaterThan(Date.now());
		expect(expanded?.next_reset_at).not.toBe(staleWindowEndsAt);
	},
);
