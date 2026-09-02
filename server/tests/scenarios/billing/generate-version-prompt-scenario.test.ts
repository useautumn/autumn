import { expect, test } from "bun:test";
import { BillingInterval, isFixedPrice } from "@autumn/shared";
import { loadCustomerAndCatalogPrices } from "@tests/integration/billing/misc/utils/findCatalogAndCustomPrices.js";
import { messagesItem } from "@tests/integration/catalog-v2/plans/licenses/utils/seedLicensePlans.js";
import { expectAttachedPlanVersionCorrect } from "@tests/integration/catalog-v2/plans/utils/expectAttachedPlanVersion.js";
import { expectPlanVersionsCorrect } from "@tests/integration/catalog-v2/plans/utils/expectCatalogPlans.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { setupGenerationContext } from "@/internal/billing/v2/actions/generateRequest/setup/setupGenerationContext.js";
import { resolveBillingRequest } from "@/internal/billing/v2/actions/resolveBillingRequest.js";
import { resetCatalogPlans } from "../catalog/utils/catalogScenario.js";

const planId = "generate-version-plan";
const customerId = "generate-version-customer";

test(
	"billing generation: customer on v2 of a three-version plan",
	async () => {
		const { autumnV2_3, ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({
					name: "Version Prompt Customer",
					paymentMethod: "success",
					testClock: false,
				}),
			],
			actions: [],
		});
		await resetCatalogPlans({ ctx, planIds: [planId] });

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: planId,
					name: "Generation Version Plan",
					price: { amount: 10, interval: BillingInterval.Month },
					items: [messagesItem(100)],
				},
			],
		});
		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: planId,
					versioning: "new_version",
					active: true,
					price: { amount: 20, interval: BillingInterval.Month },
					items: [messagesItem(200)],
				},
			],
		});

		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: planId,
		});

		await autumnV2_3.catalogV2.update({
			plans: [
				{
					plan_id: planId,
					versioning: "new_version",
					active: true,
					price: { amount: 30, interval: BillingInterval.Month },
					items: [messagesItem(300)],
				},
			],
		});

		await expectPlanVersionsCorrect({ ctx, planId, versions: [1, 2, 3] });
		await expectAttachedPlanVersionCorrect({
			ctx,
			internalCustomerId: customer.internal_id,
			planId,
			version: 2,
		});
		const { customerPrices, cusProduct } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: planId,
		});
		expect(customerPrices.find(isFixedPrice)?.config.amount).toBe(20);
		const { context } = await setupGenerationContext({ ctx, customerId });
		expect(context.customer.current_plans[0]?.effective_plan).toMatchObject({
			items: [{ feature_id: TestFeature.Messages, included: 200 }],
			price: { amount: 20, interval: BillingInterval.Month },
			version: 2,
		});

		const { request } = await resolveBillingRequest({
			ctx,
			params: {
				tool: "update_subscription",
				request: {
					customer_id: customerId,
					customer_product_id: cusProduct.id,
					version: 3,
					customize: {
						price: { amount: 20, interval: BillingInterval.Month },
					},
				},
			},
		});
		if (!("items" in request))
			throw new Error("Expected resolved update items");
		expect(request.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ price: 20 }),
				expect.objectContaining({
					feature_id: TestFeature.Messages,
					included_usage: 300,
				}),
			]),
		);

		console.log(`Customer: /sandbox/customers/${customerId}`);
	},
	{ timeout: 30_000 },
);
