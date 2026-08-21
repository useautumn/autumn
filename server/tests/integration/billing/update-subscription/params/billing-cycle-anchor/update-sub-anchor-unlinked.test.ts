import { expect, test } from "bun:test";
import {
	EntInterval,
	findActiveCustomerProductById,
	truncateMsToSecondPrecision,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import { getResetAtUpdate } from "@/internal/customers/actions/resetCustomerEntitlements/getResetAtUpdate";
import { CusService } from "@/internal/customers/CusService";

test(`${chalk.yellowBright("update-sub scheduled anchor: unlinked product retains target past natural renewal")}`, async () => {
	const customerId = "update-sub-anchor-unlinked";
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [free] })],
		actions: [s.billing.attach({ productId: free.id })],
	});
	const scheduledAnchorMs = truncateMsToSecondPrecision(
		addDays(advancedTo, 40).getTime(),
	);

	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: free.id,
		billing_cycle_anchor: scheduledAnchorMs,
	});

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const customerProduct = findActiveCustomerProductById({
		fullCus: fullCustomer,
		productId: free.id,
	});
	if (!customerProduct) throw new Error("Expected active free product");
	const naturalResetAt = customerProduct.customer_entitlements[0].next_reset_at;
	if (!naturalResetAt) throw new Error("Expected monthly entitlement reset");

	expect(customerProduct.subscription_ids).toEqual([]);
	expect(naturalResetAt).toBeLessThan(scheduledAnchorMs);
	expect(customerProduct.billing_cycle_anchor_resets_at).toBe(
		scheduledAnchorMs,
	);
	expect(
		await getResetAtUpdate({
			curResetAt: naturalResetAt,
			interval: EntInterval.Month,
			intervalCount: 1,
			cusProduct: customerProduct,
			org: ctx.org,
			env: ctx.env,
		}),
	).toBe(scheduledAnchorMs);
});
