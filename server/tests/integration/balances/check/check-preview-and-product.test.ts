/**
 * `with_preview` and `product_id` checks answer the same on both balance routes.
 *
 * Red (before): the balance worker route refused both with a 400 `invalid_request`.
 * Green (after): a preview check returns the paywall preview; a product check reads the customer's plans.
 */

import { expect, test } from "bun:test";
import { ApiVersion, FeaturePreviewScenario } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

test.concurrent(
	`${chalk.yellowBright("check-preview1: an exhausted feature previews the plan that lifts its limit")}`,
	async () => {
		const free = products.base({
			id: "check-preview-free",
			items: [items.monthlyMessages({ includedUsage: 5 })],
		});
		const pro = products.pro({
			id: "check-preview-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const customerId = "check-preview1";
		// Own sub-org: the preview ranks every plan in the org's catalog, so concurrent files' plans leak in.
		const { autumnV2_3: subOrgAutumn } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "check-preview1@autumn.test",
				}),
				s.customer({ testClock: false }),
				s.products({ list: [free, pro] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.track({ featureId: TestFeature.Messages, value: 5 }),
			],
		});

		const response = await subOrgAutumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			with_preview: true,
		});

		expect(response).toMatchObject({
			allowed: false,
			preview: {
				scenario: FeaturePreviewScenario.UsageLimit,
				feature_id: TestFeature.Messages,
				upgrade_product_id: pro.id,
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("check-preview2: plans in a group the customer does not hold are never the upgrade")}`,
	async () => {
		const free = products.base({
			id: "check-preview2-free",
			items: [items.monthlyMessages({ includedUsage: 5 })],
		});
		const pro = products.pro({
			id: "check-preview2-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const otherGroupFree = products.base({
			id: "check-preview2-other-free",
			group: "a-other-line",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const otherGroupCheap = products.base({
			id: "check-preview2-other-cheap",
			group: "a-other-line",
			items: [
				items.monthlyPrice({ price: 10 }),
				items.monthlyMessages({ includedUsage: 100 }),
			],
		});
		const customerId = "check-preview2";
		const { autumnV2_3: subOrgAutumn } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "check-preview2@autumn.test",
				}),
				s.customer({ testClock: false }),
				s.products({ list: [free, pro, otherGroupFree, otherGroupCheap] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.track({ featureId: TestFeature.Messages, value: 5 }),
			],
		});

		const response = await subOrgAutumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			with_preview: true,
		});

		expect(response).toMatchObject({
			allowed: false,
			preview: { upgrade_product_id: pro.id },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("check-preview3: an equal-price plan in the customer's group is not an upgrade")}`,
	async () => {
		const free = products.base({
			id: "check-preview3-free",
			items: [items.monthlyMessages({ includedUsage: 5 })],
		});
		const otherFree = products.base({
			id: "check-preview3-other-free",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const pro = products.pro({
			id: "check-preview3-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const customerId = "check-preview3";
		const { autumnV2_3: subOrgAutumn } = await initScenario({
			customerId,
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: "check-preview3@autumn.test",
				}),
				s.customer({ testClock: false }),
				s.products({ list: [free, otherFree, pro] }),
			],
			actions: [
				s.billing.attach({ productId: free.id }),
				s.track({ featureId: TestFeature.Messages, value: 5 }),
			],
		});

		const response = await subOrgAutumn.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			with_preview: true,
		});

		expect(response).toMatchObject({
			allowed: false,
			preview: { upgrade_product_id: pro.id },
		});
		expect(
			response.preview?.products.map((product) => product.id),
		).not.toContain(otherFree.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("check-product1: a product check answers whether the customer holds the plan")}`,
	async () => {
		const free = products.base({
			id: "check-product-free",
			items: [items.monthlyMessages({ includedUsage: 5 })],
		});
		const pro = products.pro({
			id: "check-product-pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const customerId = "check-product1";
		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [free, pro] }),
			],
			actions: [s.billing.attach({ productId: free.id })],
		});

		const held = await autumnV2_3.check({
			customer_id: customerId,
			product_id: free.id,
		});
		const notHeld = await autumnV2_3.check({
			customer_id: customerId,
			product_id: pro.id,
		});

		expect(held).toMatchObject({ allowed: true, product_id: free.id });
		expect(notHeld).toMatchObject({ allowed: false, product_id: pro.id });
	},
);
