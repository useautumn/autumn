import { expect, test } from "bun:test";
import {
	ApiVersion,
	type FullProduct,
	ProductItemFeatureType,
	ProductItemInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { AutumnRpcCli } from "@/external/autumn/autumnRpcCli.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { ProductService } from "@/internal/products/ProductService.js";
import {
	indexPricesByMatchKey,
	priceMatchKey,
	stripeConfigValue,
	expectStripeResourcesCarriedToVariant,
} from "./utils/expectVariantProductCorrect.js";
import { readableVariantTestId } from "./utils/readableVariantTestId.js";
import { createVariantPlan } from "./utils/variantTestPlanUtils.js";

const stripeFields = [
	"stripe_product_id",
	"stripe_price_id",
	"stripe_prepaid_price_v2_id",
] as const;

const prepaidMessages = ({
	price,
	billingUnits,
	interval,
}: {
	price: number;
	billingUnits: number;
	interval: ProductItemInterval;
}) => ({
	...items.prepaid({
		featureId: TestFeature.Messages,
		price,
		billingUnits,
		interval,
	}),
	feature_type: ProductItemFeatureType.SingleUse,
});

const expectNoStripeResources = ({ product }: { product: FullProduct }) => {
	expect(product.processor?.id).toBeFalsy();
	for (const price of product.prices) {
		for (const field of stripeFields) {
			expect(stripeConfigValue(price, field)).toBeFalsy();
		}
	}
};

const expectStripeResourceCoverage = ({ product }: { product: FullProduct }) => {
	expect(product.processor?.id).toBeTruthy();

	const basePrice = product.prices.find((price) => !price.entitlement_id);
	expect(stripeConfigValue(basePrice, "stripe_price_id")).toBeTruthy();

	const itemPrices = product.prices.filter((price) => price.entitlement_id);
	expect(itemPrices.length).toBeGreaterThan(0);
	for (const itemPrice of itemPrices) {
		expect(stripeConfigValue(itemPrice, "stripe_product_id")).toBeTruthy();
		expect(stripeConfigValue(itemPrice, "stripe_price_id")).toBeTruthy();
		expect(
			stripeConfigValue(itemPrice, "stripe_prepaid_price_v2_id"),
		).toBeTruthy();
	}
};

const expectStripeResourcesMatch = ({
	source,
	target,
}: {
	source: FullProduct;
	target: FullProduct;
}) => {
	expectStripeResourceCoverage({ product: source });
	expect(target.processor?.id).toBe(source.processor?.id);

	const targetPricesByKey = indexPricesByMatchKey(target);
	for (const sourcePrice of source.prices) {
		const targetPrice = targetPricesByKey.get(priceMatchKey(sourcePrice));
		expect(targetPrice).toBeDefined();
		for (const field of stripeFields) {
			expect(stripeConfigValue(targetPrice, field)).toBe(
				stripeConfigValue(sourcePrice, field),
			);
		}
	}
};

test.concurrent(
	`${chalk.yellowBright("variants stripe resources: create_variant carries product and price IDs")}`,
	async () => {
		const cid = readableVariantTestId("stripe_carryover");
		const base = products.base({
			id: `stripe_base_${cid}`,
			items: [
				items.monthlyPrice({ price: 20 }),
				prepaidMessages({
					price: 3,
					billingUnits: 100,
					interval: ProductItemInterval.Month,
				}),
			],
		});

		const { ctx } = await initScenario({
			customerId: cid,
			setup: [s.customer(), s.products({ list: [base] })],
			actions: [],
		});

		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantId = `stripe_var_${cid}`;

		await createVariantPlan({
			rpc,
			basePlanId: base.id,
			variantPlanId: variantId,
			name: "Stripe Resource Variant",
		});

		const baseFull = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: base.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const variantFull = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: variantId,
			orgId: ctx.org.id,
			env: ctx.env,
		});

		expectStripeResourceCoverage({ product: baseFull });
		expectStripeResourcesCarriedToVariant({
			base: baseFull,
			variant: variantFull,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("variants stripe resources: create_variant reuses sibling resources when base is missing resources")}`,
	async () => {
		const cid = readableVariantTestId("stripe_create_sibling");
		const base = products.base({
			id: `stripe_base_${cid}`,
			items: [
				items.monthlyPrice({ price: 20 }),
				prepaidMessages({
					price: 3,
					billingUnits: 100,
					interval: ProductItemInterval.Month,
				}),
			],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: cid,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [base], createInStripe: false }),
			],
			actions: [],
		});

		const originalConfig = ctx.org.config;
		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantAId = `stripe_var_a_${cid}`;
		const variantBId = `stripe_var_b_${cid}`;

		try {
			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: {
					config: {
						...originalConfig,
						disable_stripe_writes: true,
					},
				},
			});

			await createVariantPlan({
				rpc,
				basePlanId: base.id,
				variantPlanId: variantAId,
				name: "Stripe Create Sibling Variant A",
			});

			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: { config: originalConfig },
			});

			await autumnV2_2.billing.attach({
				customer_id: cid,
				plan_id: variantAId,
			});
			const variantAAfterAttach = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: variantAId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expect(variantAAfterAttach.processor?.id).toBeTruthy();
			expectStripeResourceCoverage({ product: variantAAfterAttach });

			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: {
					config: {
						...originalConfig,
						disable_stripe_writes: true,
					},
				},
			});

			await createVariantPlan({
				rpc,
				basePlanId: base.id,
				variantPlanId: variantBId,
				name: "Stripe Create Sibling Variant B",
			});
			const variantBAfterCreate = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: variantBId,
				orgId: ctx.org.id,
				env: ctx.env,
			});

			expectStripeResourcesMatch({
				source: variantAAfterAttach,
				target: variantBAfterCreate,
			});
		} finally {
			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: { config: originalConfig },
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("variants stripe resources: attach lazily creates resources for one variant and reuses them for sibling")}`,
	async () => {
		const cid = readableVariantTestId("stripe_sibling");
		const siblingCustomerId = `${cid}_sibling`;
		const base = products.base({
			id: `stripe_base_${cid}`,
			items: [
				items.monthlyPrice({ price: 20 }),
				prepaidMessages({
					price: 3,
					billingUnits: 100,
					interval: ProductItemInterval.Month,
				}),
			],
		});

		const { autumnV2_2, ctx } = await initScenario({
			customerId: cid,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.otherCustomers([
					{ id: siblingCustomerId, paymentMethod: "success" },
				]),
				s.products({ list: [base], createInStripe: false }),
			],
			actions: [],
		});

		const originalConfig = ctx.org.config;
		const rpc = new AutumnRpcCli({
			secretKey: ctx.orgSecretKey,
			version: ApiVersion.V2_1,
		});
		const variantAId = `stripe_var_a_${cid}`;
		const variantBId = `stripe_var_b_${cid}`;

		try {
			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: {
					config: {
						...originalConfig,
						disable_stripe_writes: true,
					},
				},
			});

			await createVariantPlan({
				rpc,
				basePlanId: base.id,
				variantPlanId: variantAId,
				name: "Stripe Sibling Variant A",
			});
			await createVariantPlan({
				rpc,
				basePlanId: base.id,
				variantPlanId: variantBId,
				name: "Stripe Sibling Variant B",
			});

			const variantABefore = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: variantAId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const variantBBefore = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: variantBId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const baseBefore = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: base.id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expectNoStripeResources({ product: baseBefore });
			expectNoStripeResources({ product: variantABefore });
			expectNoStripeResources({ product: variantBBefore });

			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: {
					config: originalConfig,
				},
			});

			await autumnV2_2.billing.attach({
				customer_id: cid,
				plan_id: variantAId,
			});
			const variantAAfterAttach = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: variantAId,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			const baseAfterVariantAAttach = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: base.id,
				orgId: ctx.org.id,
				env: ctx.env,
			});
			expectNoStripeResources({ product: baseAfterVariantAAttach });
			expect(variantAAfterAttach.processor?.id).toBeTruthy();
			expectStripeResourceCoverage({ product: variantAAfterAttach });

			await autumnV2_2.billing.attach({
				customer_id: siblingCustomerId,
				plan_id: variantBId,
			});
			const variantBAfterAttach = await ProductService.getFull({
				db: ctx.db,
				idOrInternalId: variantBId,
				orgId: ctx.org.id,
				env: ctx.env,
			});

			expectStripeResourcesMatch({
				source: variantAAfterAttach,
				target: variantBAfterAttach,
			});
		} finally {
			await OrgService.update({
				db: ctx.db,
				orgId: ctx.org.id,
				updates: { config: originalConfig },
			});
		}
	},
);
