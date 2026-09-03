/**
 * catalogV2.get echoes Stripe product/price ids as `processors.stripe`.
 *
 * Contract:
 *   New fields:  plan.processors.stripe.{product_id, additional_product_ids?}
 *                price.processors.stripe.{price_id}
 *                items[].price.processors.stripe.{price_id}
 *   Behaviors:   paid + Stripe init → GET matches product.processor / price.config
 *                free plan / create_in_stripe:false → processors omitted
 *
 * Red (current): processors is not on ApiPlanV1 / GET
 * Green (after): GET echoes existing DB stripe ids; omit when unset
 */

import { expect, test } from "bun:test";
import {
	type ApiPlanExpandedV1,
	BillingInterval,
	BillingMethod,
	type FullProduct,
} from "@autumn/shared";
import {
	findBasePrice,
	findFeaturePrice,
	stripeConfigValue,
} from "@tests/integration/utils/expectStripePriceResources.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { initScenario } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { uniqueTestId } from "../../utils/uniqueTestId.js";
import { deleteDbPlans } from "../utils/expectCatalogPlans.js";
import { expectApiPlanProcessorsCorrect } from "./utils/expectPlanProcessors.js";

const getFull = async ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId: string;
}): Promise<FullProduct> =>
	ProductService.getFull({
		db: ctx.db,
		idOrInternalId: planId,
		orgId: ctx.org.id,
		env: ctx.env,
	});

const getApiPlan = async ({
	autumn,
	planId,
}: {
	autumn: AutumnInt;
	planId: string;
}): Promise<ApiPlanExpandedV1> => {
	const catalog = await autumn.catalogV2.get({ include_archived: true });
	const plan = catalog.plans.find((row) => row.id === planId);
	expect(plan, `GET catalog plan ${planId}`).toBeDefined();
	return plan!;
};

const prepaidMessagesItem = {
	feature_id: TestFeature.Messages,
	included: 0,
	price: {
		amount: 10,
		interval: BillingInterval.Month,
		billing_method: BillingMethod.Prepaid,
		billing_units: 100,
	},
};

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors get: paid plan echoes stripe product and price ids")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_proc_get_paid");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Processors Get Paid",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [prepaidMessagesItem],
					},
				],
			});

			const db = await getFull({ ctx, planId });
			const api = await getApiPlan({ autumn: autumnV2_3, planId });
			const base = findBasePrice({ product: db });
			const prepaid = findFeaturePrice({
				product: db,
				featureId: TestFeature.Messages,
			});
			const prepaidPriceId =
				stripeConfigValue({
					price: prepaid,
					field: "stripe_prepaid_price_v2_id",
				}) ?? stripeConfigValue({ price: prepaid, field: "stripe_price_id" });

			expect(db.processor?.id, "db processor minted").toMatch(/^prod_/);
			expectApiPlanProcessorsCorrect({
				plan: api,
				stripe: { product_id: db.processor?.id ?? "" },
				basePriceId: stripeConfigValue({
					price: base,
					field: "stripe_price_id",
				}),
				items: {
					[TestFeature.Messages]: prepaidPriceId,
				},
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors get: free plan omits processors")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_proc_get_free");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Processors Get Free",
						items: [{ feature_id: TestFeature.Dashboard }],
					},
				],
			});

			const api = await getApiPlan({ autumn: autumnV2_3, planId });
			expect(api.price, "free plan price").toBeNull();
			expectApiPlanProcessorsCorrect({
				plan: api,
				stripe: null,
				items: { [TestFeature.Dashboard]: null },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("catalogV2 processors get: create_in_stripe false omits processors")}`,
	async () => {
		const { autumnV2_3, ctx } = await initScenario({ setup: [], actions: [] });
		const planId = uniqueTestId("cv2_proc_get_skip");
		await deleteDbPlans({ ctx, planIds: [planId] });
		try {
			await autumnV2_3.catalogV2.update({
				plans: [
					{
						plan_id: planId,
						name: "Processors Get Skip",
						price: { amount: 20, interval: BillingInterval.Month },
						items: [prepaidMessagesItem],
						create_in_stripe: false,
					},
				],
			});

			const api = await getApiPlan({ autumn: autumnV2_3, planId });
			expectApiPlanProcessorsCorrect({
				plan: api,
				stripe: null,
				basePriceId: null,
				items: { [TestFeature.Messages]: null },
			});
		} finally {
			await deleteDbPlans({ ctx, planIds: [planId] });
		}
	},
);
