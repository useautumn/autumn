/**
 * Billing Verify: a paid plan with no Stripe subscription is an error.
 *
 * Contract under test (billingActions.verify, billing_verify export):
 *   New types/fields:
 *     - SubscriptionMismatch "missing_stripe_subscription"
 *       { customer_product_id, plan_id, plan_name, entity_id } on
 *       customer_mismatches — severity "error".
 *   New behaviors:
 *     - An active plan with an overage price, attached to two entities without
 *       billing, links to no Stripe subscription -> one
 *       missing_stripe_subscription per plan, while subscriptions stays empty.
 *     - A subscription_ids whitelist scopes verify to those subscriptions, so
 *       the finding is left out.
 *     - The export loads that customer although it has nothing on Stripe, and
 *       writes one row for it.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { verify } from "@/internal/billing/v2/actions/verify/verify";
import { CusService } from "@/internal/customers/CusService";
import { createBillingVerifyStripeReader } from "@/internal/customers/exports/verify/createBillingVerifyStripeReader";
import { filterBillingVerifyCandidates } from "@/internal/customers/exports/verify/filterBillingVerifyCandidates";
import { verifyCustomerToExportRows } from "@/internal/customers/exports/verify/verifyCustomerToExportRows";

test.concurrent(
	`${chalk.yellowBright("billing-verify missing subscription: entity plans with an overage price but no Stripe subscription -> missing_stripe_subscription errors")}`,
	async () => {
		const customerId = "verify-missing-subscription";

		const overage = products.base({
			id: "overage",
			items: [items.consumableMessages({ includedUsage: 0 })],
		});

		const { ctx, autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [overage] }),
			],
			actions: [],
		});

		for (const entity of entities) {
			await autumnV1.billing.attach({
				customer_id: customerId,
				product_id: overage.id,
				entity_id: entity.id,
				no_billing_changes: true,
			});
		}

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const planCustomerProducts = fullCustomer.customer_products.filter(
			(customerProduct) => customerProduct.product.id === overage.id,
		);
		expect(planCustomerProducts).toHaveLength(2);
		for (const customerProduct of planCustomerProducts) {
			expect(customerProduct.subscription_ids ?? []).toEqual([]);
		}

		// ── Contract: each unbilled plan is a customer-level error ─────────
		const result = await verify({ ctx, params: { customer_id: customerId } });

		expect(result.subscriptions).toEqual([]);
		expect(result.customer_mismatches).toHaveLength(2);
		expect(
			result.customer_mismatches.map((mismatch) =>
				mismatch.type === "missing_stripe_subscription"
					? mismatch.entity_id
					: undefined,
			),
		).toEqual(expect.arrayContaining(entities.map((entity) => entity.id)));
		for (const mismatch of result.customer_mismatches) {
			expect(mismatch).toMatchObject({
				type: "missing_stripe_subscription",
				severity: "error",
				plan_id: overage.id,
			});
			expect(mismatch.message).toContain("has no Stripe subscription");
		}

		// ── Contract: a subscription whitelist leaves the finding out ──────
		const scoped = await verify({
			ctx,
			params: { customer_id: customerId, subscription_ids: ["sub_unrelated"] },
		});
		expect(scoped.customer_mismatches).toEqual([]);

		// ── Contract: the export loads the customer and writes its row ─────
		const stripeCustomerId = fullCustomer.processor?.id;
		if (!stripeCustomerId) throw new Error("Customer has no Stripe customer");
		const scalar = {
			internal_id: fullCustomer.internal_id,
			id: fullCustomer.id ?? null,
			name: fullCustomer.name ?? null,
			email: fullCustomer.email ?? null,
			processor: fullCustomer.processor ?? null,
		};
		const sweep = {
			stripeReader: createBillingVerifyStripeReader({
				stripeCli: createStripeCli({ org: ctx.org, env: ctx.env }),
			}),
			sweptSubscriptions: new Map(),
		};

		const { candidates } = await filterBillingVerifyCandidates({
			ctx,
			scalars: [scalar],
			sweep,
		});
		expect(candidates.map((candidate) => candidate.id)).toEqual([customerId]);

		const rows = await verifyCustomerToExportRows({ ctx, scalar, sweep });
		expect(rows).toMatchObject([
			{
				customer_id: customerId,
				stripe_customer_id: stripeCustomerId,
				stripe_subscription_ids: null,
				severity: "error",
				issues: "missing_stripe_subscription",
			},
		]);
	},
);
