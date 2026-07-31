/** Red: canceling one paid main product creates Basic despite another effective paid main product in scope.
 * Green: preview and execution omit Basic while leaving the remaining paid product and Stripe subscription unchanged. */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, UpdateSubscriptionV1Params } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import {
	getEntitySubscriptionId,
	getSubscriptionId,
} from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { billingActions } from "@/internal/billing/v2/actions";
import { ProductService } from "@/internal/products/ProductService";

const cases = [
	{
		cancelAction: "cancel_immediately",
		suffix: "immediate",
		remainingScope: "same",
		expectDefault: false,
	},
	{
		cancelAction: "cancel_end_of_cycle",
		suffix: "end-of-cycle",
		remainingScope: "same",
		expectDefault: false,
	},
	{
		cancelAction: "cancel_immediately",
		suffix: "different-group",
		remainingScope: "group",
		expectDefault: true,
	},
	{
		cancelAction: "cancel_end_of_cycle",
		suffix: "different-group-end-of-cycle",
		remainingScope: "group",
		expectDefault: true,
	},
	{
		cancelAction: "cancel_immediately",
		suffix: "different-entity",
		remainingScope: "entity",
		expectDefault: true,
	},
] as const;

for (const { cancelAction, suffix, remainingScope, expectDefault } of cases) {
	test.concurrent(
		`${chalk.yellowBright(`cancel ${suffix}: default respects paid product scope`)}`,
		async () => {
			const customerId = `cancel-multi-paid-${suffix}`;
			const basic = products.base({
				id: "basic",
				isDefault: true,
				items: [items.monthlyMessages({ includedUsage: 10 })],
			});
			const target = products.pro({
				id: "target",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			});
			const remaining = products.base({
				id: "remaining",
				group:
					remainingScope === "entity" ? undefined : `${customerId}-separate`,
				items: [
					items.monthlyUsers({ includedUsage: 10 }),
					items.monthlyPrice({ price: 30 }),
				],
			});

			const { autumnV1, autumnV2_2, ctx, entities } = await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success", withDefault: true }),
					s.products({ list: [basic, target, remaining] }),
					...(remainingScope === "entity"
						? [s.entities({ count: 1, featureId: TestFeature.Users })]
						: []),
				],
				actions: [],
			});

			const customerWithDefault =
				await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer: customerWithDefault,
				active: [basic.id],
			});

			await autumnV2_2.billing.attach({
				customer_id: customerId,
				plan_id: target.id,
			});
			await autumnV2_2.billing.attach({
				customer_id: customerId,
				plan_id: remaining.id,
				new_billing_subscription: true,
				entity_id: remainingScope === "entity" ? entities[0].id : undefined,
			});

			if (remainingScope === "same") {
				const [targetProduct, remainingProduct] = await Promise.all([
					ProductService.getFull({
						db: ctx.db,
						idOrInternalId: target.id,
						orgId: ctx.org.id,
						env: ctx.env,
					}),
					ProductService.getFull({
						db: ctx.db,
						idOrInternalId: remaining.id,
						orgId: ctx.org.id,
						env: ctx.env,
					}),
				]);

				// Simulate the confirmed overlap without reproducing historical creation races.
				await ProductService.updateByInternalId({
					db: ctx.db,
					internalId: remainingProduct.internal_id,
					update: { group: targetProduct.group },
				});
			}

			const targetSubscriptionId = await getSubscriptionId({
				ctx,
				customerId,
				productId: target.id,
			});
			const remainingSubscriptionId =
				remainingScope === "entity"
					? await getEntitySubscriptionId({
							ctx,
							customerId,
							entityId: entities[0].id,
							productId: remaining.id,
						})
					: await getSubscriptionId({
							ctx,
							customerId,
							productId: remaining.id,
						});
			expect(remainingSubscriptionId).not.toBe(targetSubscriptionId);
			const remainingSubscriptionBefore =
				await ctx.stripeCli.subscriptions.retrieve(remainingSubscriptionId);
			const updateParams = {
				customer_id: customerId,
				plan_id: target.id,
				cancel_action: cancelAction,
			} satisfies UpdateSubscriptionV1Params;

			const { billingPlan: previewPlan } =
				await billingActions.updateSubscription({
					ctx,
					params: updateParams,
					preview: true,
				});
			const previewDefault = previewPlan?.autumn.insertCustomerProducts.find(
				(customerProduct) => customerProduct.product.id === basic.id,
			);

			await autumnV2_2.billing.update(updateParams);

			const customerAfterCancel =
				await autumnV1.customers.get<ApiCustomerV3>(customerId);
			await expectCustomerProducts({
				customer: customerAfterCancel,
				active: [
					...(remainingScope === "entity" ? [] : [remaining.id]),
					...(expectDefault && cancelAction === "cancel_immediately"
						? [basic.id]
						: []),
				],
				canceling:
					cancelAction === "cancel_end_of_cycle" ? [target.id] : undefined,
				scheduled:
					expectDefault && cancelAction === "cancel_end_of_cycle"
						? [basic.id]
						: undefined,
				notPresent:
					cancelAction === "cancel_immediately"
						? [target.id, ...(!expectDefault ? [basic.id] : [])]
						: !expectDefault
							? [basic.id]
							: undefined,
			});

			if (remainingScope === "entity") {
				const entityAfterCancel = await autumnV1.entities.get(
					customerId,
					entities[0].id,
				);
				await expectCustomerProducts({
					customer: entityAfterCancel,
					active: [remaining.id],
				});
			}

			const remainingSubscriptionAfter =
				await ctx.stripeCli.subscriptions.retrieve(remainingSubscriptionId);
			expect(remainingSubscriptionAfter.status).toBe(
				remainingSubscriptionBefore.status,
			);
			expect(remainingSubscriptionAfter.cancel_at_period_end).toBe(
				remainingSubscriptionBefore.cancel_at_period_end,
			);
			expect(
				remainingSubscriptionAfter.items.data.map((item) => ({
					id: item.id,
					priceId: item.price.id,
					quantity: item.quantity,
				})),
			).toEqual(
				remainingSubscriptionBefore.items.data.map((item) => ({
					id: item.id,
					priceId: item.price.id,
					quantity: item.quantity,
				})),
			);
			expect(previewDefault === undefined).toBe(!expectDefault);
		},
	);
}
