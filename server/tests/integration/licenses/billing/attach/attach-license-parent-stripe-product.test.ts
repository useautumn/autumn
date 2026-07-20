/** Contract: license prices always use the license plan's Stripe Product.
 * This holds for custom attach/update prices and shared catalog resources. */
import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	BillingInterval,
	type FullProduct,
	productToBasePrice,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { getFullLicenseProduct } from "@tests/integration/licenses/catalog-update/utils/getFullLicenseProduct";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

const expectLicenseProductStripeResourcesUnchanged = ({
	before,
	after,
}: {
	before: FullProduct;
	after: FullProduct;
}) => {
	const beforeBasePrice = productToBasePrice({ product: before });
	const afterBasePrice = productToBasePrice({ product: after });
	expect(after.processor?.id).toBe(before.processor?.id);
	expect(afterBasePrice?.id).toBe(beforeBasePrice?.id);
	expect(afterBasePrice?.config.stripe_price_id).toBe(
		beforeBasePrice?.config.stripe_price_id,
	);
	expect(afterBasePrice?.config.stripe_product_id).toBe(
		beforeBasePrice?.config.stripe_product_id,
	);
};

test.concurrent(
	`${chalk.yellowBright("license attach: custom base price stays under the license Stripe product")}`,
	async () => {
		const customerId = "attach-license-parent-stripe-product";
		const parent = products.base({
			id: `${customerId}-parent`,
			items: [items.dashboard()],
		});
		const teamSeat = products.base({
			id: `${customerId}-seat`,
			items: [items.monthlyPrice({ price: 10 })],
			group: `${customerId}-licenses`,
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [parent, teamSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: teamSeat.id,
					included: 0,
				}),
			],
		});
		const [parentBefore, childBefore] = await Promise.all([
			ProductService.getFull({
				db: scenario.ctx.db,
				idOrInternalId: parent.id,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
			}),
			ProductService.getFull({
				db: scenario.ctx.db,
				idOrInternalId: teamSeat.id,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
			}),
		]);
		const licenseStripeProductId = childBefore.processor?.id;
		if (!licenseStripeProductId) {
			throw new Error(`License ${teamSeat.id} has no Stripe product`);
		}
		expect(parentBefore.processor?.id).not.toBe(licenseStripeProductId);

		await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: teamSeat.id, quantity: 2 }],
			customize: {
				upsert_licenses: [
					{
						license_plan_id: teamSeat.id,
						customize: {
							price: {
								amount: 25,
								interval: BillingInterval.Month,
							},
						},
					},
				],
			},
		});

		await expectLicenseDefinitionCorrect({
			ctx: scenario.ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: true,
			isCustomized: true,
			basePrice: {
				amount: 25,
				interval: BillingInterval.Month,
				isCustom: true,
				stripeProductId: licenseStripeProductId,
			},
		});

		const childAfter = await ProductService.getFull({
			db: scenario.ctx.db,
			idOrInternalId: teamSeat.id,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
		});
		expectLicenseProductStripeResourcesUnchanged({
			before: childBefore,
			after: childAfter,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license update: custom base price stays under the license Stripe product")}`,
	async () => {
		const customerId = "update-license-parent-stripe-product";
		const parent = products.base({
			id: `${customerId}-parent`,
			items: [items.dashboard()],
		});
		const teamSeat = products.base({
			id: `${customerId}-seat`,
			items: [items.monthlyPrice({ price: 10 })],
			group: `${customerId}-licenses`,
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [parent, teamSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parent.id,
					licenseProductId: teamSeat.id,
					included: 0,
				}),
				s.billing.attach({
					productId: parent.id,
					licenseQuantities: [{ licenseProductId: teamSeat.id, quantity: 2 }],
				}),
			],
		});
		const [parentBefore, childBefore] = await Promise.all([
			ProductService.getFull({
				db: scenario.ctx.db,
				idOrInternalId: parent.id,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
			}),
			ProductService.getFull({
				db: scenario.ctx.db,
				idOrInternalId: teamSeat.id,
				orgId: scenario.ctx.org.id,
				env: scenario.ctx.env,
			}),
		]);
		const licenseStripeProductId = childBefore.processor?.id;
		if (!licenseStripeProductId) {
			throw new Error(`License ${teamSeat.id} has no Stripe product`);
		}
		expect(parentBefore.processor?.id).not.toBe(licenseStripeProductId);

		await scenario.autumnV2_3.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: parent.id,
			customize: {
				upsert_licenses: [
					{
						license_plan_id: teamSeat.id,
						customize: {
							price: {
								amount: 30,
								interval: BillingInterval.Month,
							},
						},
					},
				],
			},
		});

		await expectLicenseDefinitionCorrect({
			ctx: scenario.ctx,
			customerId,
			parentPlanId: parent.id,
			isCustom: true,
			isCustomized: true,
			basePrice: {
				amount: 30,
				interval: BillingInterval.Month,
				isCustom: true,
				stripeProductId: licenseStripeProductId,
			},
		});

		const childAfter = await ProductService.getFull({
			db: scenario.ctx.db,
			idOrInternalId: teamSeat.id,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
		});
		expectLicenseProductStripeResourcesUnchanged({
			before: childBefore,
			after: childAfter,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("license attach: ordinary links never re-home the shared child base price")}`,
	async () => {
		const customerId = "attach-license-shared-base-price-guard";
		const parentA = products.base({
			id: `${customerId}-a`,
			items: [items.dashboard()],
		});
		const parentB = products.base({
			id: `${customerId}-b`,
			items: [items.dashboard()],
		});
		const teamSeat = products.base({
			id: `${customerId}-seat`,
			items: [items.monthlyPrice({ price: 10 })],
			group: `${customerId}-licenses`,
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [parentA, parentB, teamSeat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: parentA.id,
					licenseProductId: teamSeat.id,
					included: 0,
				}),
				s.licenses.link({
					parentProductId: parentB.id,
					licenseProductId: teamSeat.id,
					included: 0,
				}),
			],
		});
		const childBefore = await ProductService.getFull({
			db: scenario.ctx.db,
			idOrInternalId: teamSeat.id,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
		});
		for (const parent of [parentA, parentB]) {
			await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: parent.id,
				redirect_mode: "if_required",
				license_quantities: [{ license_plan_id: teamSeat.id, quantity: 1 }],
			});
		}

		const childAfter = await ProductService.getFull({
			db: scenario.ctx.db,
			idOrInternalId: teamSeat.id,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
		});
		expectLicenseProductStripeResourcesUnchanged({
			before: childBefore,
			after: childAfter,
		});
		expect(
			productToBasePrice({ product: childAfter })?.config.stripe_product_id,
		).toBe(childBefore.processor?.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("license attach: feature-only customization retains the child base price")}`,
	async () => {
		const customerId = "attach-license-feature-only-price-guard";
		const parent = products.base({
			id: `${customerId}-parent`,
			items: [items.dashboard()],
		});
		const teamSeat = products.base({
			id: `${customerId}-seat`,
			items: [items.monthlyPrice({ price: 10 })],
			group: `${customerId}-licenses`,
		});
		const scenario = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.products({ list: [parent, teamSeat] }),
			],
			actions: [],
		});
		const childBefore = await ProductService.getFull({
			db: scenario.ctx.db,
			idOrInternalId: teamSeat.id,
			orgId: scenario.ctx.org.id,
			env: scenario.ctx.env,
		});
		await scenario.autumnV2_2.post("/plans.update", {
			plan_id: parent.id,
			licenses: [
				{
					license_plan_id: teamSeat.id,
					customize: {
						add_items: [itemsV2.monthlyWords({ included: 50 })],
					},
				},
			],
		});
		await scenario.autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: parent.id,
			redirect_mode: "if_required",
			license_quantities: [{ license_plan_id: teamSeat.id, quantity: 1 }],
		});

		const customized = await getFullLicenseProduct({
			ctx: scenario.ctx,
			parentPlanId: parent.id,
			licensePlanId: teamSeat.id,
		});
		expect(customized.planLicense.customized).toBe(true);
		expectLicenseProductStripeResourcesUnchanged({
			before: childBefore,
			after: customized.fullLicenseProduct,
		});
		expect(
			customized.fullLicenseProduct.entitlements.some(
				(entitlement) => entitlement.feature_id === TestFeature.Words,
			),
		).toBe(true);
	},
);
