/**
 * TDD tests for the V2 batch reset worker (batchResetCustomerEntitlementsV2):
 * candidates that must NOT be reset, and the verdicts they receive.
 *
 * Contract under test:
 *   Behaviors:
 *     - price-backed ent on a live subscription -> verdict
 *       "resets_via_invoice"; balance AND next_reset_at untouched (that reset
 *       is owned by the invoice.created webhook); reset_by_invoice = true is
 *       persisted so the scan stops re-picking the row
 *     - past_due product WITHOUT config.ignore_past_due -> verdict
 *       "no_action" (reason product_past_due); untouched
 *     - past_due product WITH config.ignore_past_due = true -> resets normally
 *     - expired product -> verdict "should_expire"; cusEnt marked expired
 *     - entitlement flipped to unlimited -> verdict "clear_next_reset"
 *       (unlimited: true); no reset mutation
 *   Side effects:
 *     - should_expire persists the denormalized cusEnt expiry flag.
 */

import { expect, test } from "bun:test";
import {
	AllowanceType,
	CusProductStatus,
	customerProducts,
	entitlements,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq } from "drizzle-orm";
import { getResetEligibleCustomerEntitlementsPage } from "@/internal/customers/cusProducts/cusEnts/repos/getResetEligibleCustomerEntitlementsPage.js";
import {
	fetchCustomerEntitlementRow,
	runBatchResetV2,
} from "./batchResetV2TestUtils.js";

const INCLUDED_USAGE = 100;

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 skips: price-backed ent on live subscription gets resets_via_invoice verdict")}`,
	async () => {
		const customerId = "batch-reset-v2-skip-price-backed";
		const plan = products.pro({
			id: "skip-price-backed",
			items: [items.prepaidMessages({ billingUnits: 100 })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({
					productId: plan.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 100 }],
				}),
			],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(customerEntitlement).toBeDefined();

		const pastTime = Date.now() - 1000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: pastTime,
		});
		const rowBefore = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});

		// ── Contract: resets_via_invoice verdict, no mutation ───────────
		expect(result.resetMutations.length).toBe(0);
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				kind: "resets_via_invoice",
				customerEntitlementId: customerEntitlement!.id,
			}),
		]);

		// ── Contract: row untouched, but flagged reset_by_invoice ───────
		const rowAfter = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement!.id,
		});
		expect(rowAfter.balance).toBe(rowBefore.balance);
		expect(rowAfter.next_reset_at).toBe(pastTime);
		expect(rowAfter.reset_by_invoice).toBe(true);

		// ── Contract: the scan no longer picks the flagged row up ───────
		const page = await getResetEligibleCustomerEntitlementsPage({
			db: ctx.db,
			dueBefore: Date.now(),
			cursor: null,
			limit: 10_000,
		});
		expect(page.map((row) => row.id)).not.toContain(customerEntitlement!.id);
	},
);

const initPastDueScenario = async ({
	customerId,
	ignorePastDue,
	productStatus,
}: {
	customerId: string;
	ignorePastDue: boolean;
	productStatus: CusProductStatus;
}) => {
	const plan = products.base({
		id: "skip-status",
		items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
	});
	plan.config = { ignore_past_due: ignorePastDue };

	const { ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [
			s.attach({ productId: plan.id }),
			s.track({
				featureId: TestFeature.Messages,
				value: 25,
				timeout: 3000,
			}),
		],
	});

	const customerEntitlement = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(customerEntitlement).toBeDefined();
	expect(customerEntitlement!.customer_product_id).toBeDefined();

	const pastTime = Date.now() - 1000;
	await expireCusEntForReset({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
		pastTimeMs: pastTime,
	});
	await ctx.db
		.update(customerProducts)
		.set({ status: productStatus })
		.where(eq(customerProducts.id, customerEntitlement!.customer_product_id!));

	return { ctx, customerEntitlement: customerEntitlement!, pastTime };
};

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 skips: past_due product without ignore_past_due gets no_action verdict")}`,
	async () => {
		const { ctx, customerEntitlement, pastTime } = await initPastDueScenario({
			customerId: "batch-reset-v2-skip-past-due",
			ignorePastDue: false,
			productStatus: CusProductStatus.PastDue,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		expect(result.resetMutations.length).toBe(0);
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				kind: "no_action",
				reason: "product_past_due",
				customerEntitlementId: customerEntitlement.id,
			}),
		]);

		const rowAfter = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(rowAfter.next_reset_at).toBe(pastTime);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 skips: past_due product WITH ignore_past_due resets normally")}`,
	async () => {
		const { ctx, customerEntitlement } = await initPastDueScenario({
			customerId: "batch-reset-v2-skip-past-due-ignored",
			ignorePastDue: true,
			productStatus: CusProductStatus.PastDue,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		expect(result.resetMutations.length).toBe(1);

		const rowAfter = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(rowAfter.balance).toBe(INCLUDED_USAGE);
		expect(rowAfter.next_reset_at!).toBeGreaterThan(Date.now());
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 skips: expired product marks its customer entitlement expired")}`,
	async () => {
		const { ctx, customerEntitlement, pastTime } = await initPastDueScenario({
			customerId: "batch-reset-v2-skip-expired-product",
			ignorePastDue: false,
			productStatus: CusProductStatus.Expired,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});

		expect(result.resetMutations.length).toBe(0);
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				kind: "should_expire",
				customerEntitlementId: customerEntitlement.id,
			}),
		]);

		const rowAfter = await fetchCustomerEntitlementRow({
			db: ctx.db,
			customerEntitlementId: customerEntitlement.id,
		});
		expect(rowAfter.expired).toBe(true);
		expect(rowAfter.next_reset_at).toBe(pastTime);
	},
);

test.concurrent(
	`${chalk.yellowBright("batch-reset-v2 skips: entitlement flipped to unlimited gets clear_next_reset verdict")}`,
	async () => {
		const customerId = "batch-reset-v2-skip-unlimited";
		const plan = products.base({
			id: "skip-unlimited",
			items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
		});

		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});

		const customerEntitlement = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		expect(customerEntitlement).toBeDefined();

		// Simulate the catalog entitlement having become unlimited while the
		// cusEnt still carries a stale next_reset_at.
		await ctx.db
			.update(entitlements)
			.set({ allowance_type: AllowanceType.Unlimited })
			.where(eq(entitlements.id, customerEntitlement!.entitlement_id));
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement!.id],
		});

		expect(result.resetMutations.length).toBe(0);
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				kind: "clear_next_reset",
				unlimited: true,
				customerEntitlementId: customerEntitlement!.id,
			}),
		]);
	},
);
