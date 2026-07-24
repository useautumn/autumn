/** A committed Autumn plan rolls back without touching Stripe. */

import { expect, test } from "bun:test";
import type { ApiCustomerV5, AttachParamsV1 } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { billingActions } from "@/internal/billing/v2/actions";
import { CusService } from "@/internal/customers/CusService";
import { getCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getCachedFullCustomer";
import { setCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/setCachedFullCustomer";

test.concurrent(
	`${chalk.yellowBright("billing.rollback: restores Autumn without creating Stripe resources")}`,
	async () => {
		const customerId = "billing-rollback-paid-attach";
		const pro = products.pro({
			id: "rollback-pro",
			items: [],
		});
		const { autumnV1, autumnV2_2, ctx } = await initScenario({
			setup: [
				s.deleteCustomer({ customerId }),
				s.products({
					list: [pro],
					prefix: customerId,
					createInStripe: false,
				}),
			],
			actions: [],
		});
		await autumnV1.customers.create({
			id: customerId,
			name: customerId,
			email: `${customerId}@example.com`,
			currency: "usd",
			internalOptions: { disable_defaults: true },
		});
		const attached = await billingActions.attach({
			ctx,
			params: {
				customer_id: customerId,
				plan_id: pro.id,
				redirect_mode: "if_required",
				no_billing_changes: true,
			} satisfies AttachParamsV1,
			skipAutumnCheckout: true,
		});
		if (!attached.billingPlan)
			throw new Error("Expected an executed billing plan");
		const autumnBillingPlan = attached.billingPlan.autumn;
		const attachedCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		await setCachedFullCustomer({
			ctx,
			fullCustomer: attachedCustomer,
			customerId,
			fetchTimeMs: Date.now(),
			source: "billing.rollback.test",
			overwrite: true,
		});
		expect(
			(
				await getCachedFullCustomer({
					ctx,
					customerId,
				})
			)?.customer_products,
		).toHaveLength(1);
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		const rollbackPlan = await billingActions.rollback({
			ctx,
			autumnBillingPlan,
		});

		expect(rollbackPlan.deleteCustomerProducts).toEqual(
			autumnBillingPlan.insertCustomerProducts,
		);
		expect(await getCachedFullCustomer({ ctx, customerId })).toBeUndefined();
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		await expectCustomerProducts({ customer, notPresent: [pro.id] });
		expect(
			(
				await CusService.getFull({
					ctx,
					idOrInternalId: customerId,
				})
			).customer_products,
		).toHaveLength(0);

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
