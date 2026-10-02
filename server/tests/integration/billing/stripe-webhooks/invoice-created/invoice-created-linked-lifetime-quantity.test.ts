import { expect, test } from "bun:test";
import {
	EntInterval,
	findCustomerEntitlementByFeature,
	OnDecrease,
	OnIncrease,
	ProductItemInterval,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import {
	WEBHOOK_SETTLE_TIMEOUT_MS,
	WEBHOOK_TEST_TIMEOUT_MS,
} from "@tests/utils/pollableCustomerExpect";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import {
	constructArrearProratedItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";

test(
	"invoice.created: linked lifetime quantity promotion and freed seat land together",
	async () => {
		const customerId = "invoice-linked-lifetime-quantity";
		const pro = products.base({
			id: "lifetime-with-seats",
			items: [
				constructArrearProratedItem({
					featureId: TestFeature.Users,
					includedUsage: 0,
					pricePerUnit: 50,
					config: {
						on_increase: OnIncrease.BillImmediately,
						on_decrease: OnDecrease.None,
					},
				}),
				constructPrepaidItem({
					featureId: TestFeature.Messages,
					entityFeatureId: TestFeature.Users,
					interval: null,
					priceInterval: ProductItemInterval.Month,
					includedUsage: 0,
					billingUnits: 1,
					price: 0.1,
					config: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.NoProrations,
					},
				}),
			],
		});
		const { autumnV2_4, ctx, customer, entities, testClockId } =
			await initScenario({
				customerId,
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
				],
				actions: [
					s.billing.attach({
						productId: pro.id,
						options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
					}),
					s.warmEntityCaches(),
				],
			});
		const customerProducts = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer!.internal_id,
		});
		expect(customerProducts).toHaveLength(1);
		const readProduct = () =>
			CusProductService.getFull({ db: ctx.db, id: customerProducts[0].id });
		await autumnV2_4.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 100 }],
		});
		await autumnV2_4.entities.delete(customerId, entities[1].id);
		await pollUntilAsserted({
			fetch: readProduct,
			assert: (product) => {
				expect(product!.internal_entity_id).toBeNull();
				expect(product!.options).toContainEqual(
					expect.objectContaining({
						feature_id: TestFeature.Messages,
						quantity: 200,
						upcoming_quantity: 100,
					}),
				);
				const messages = findCustomerEntitlementByFeature({
					cusEnts: product!.customer_entitlements,
					featureId: TestFeature.Messages,
					errorOnNotFound: true,
				});
				expect(messages.entitlement.interval).toBe(EntInterval.Lifetime);
				expect(messages.entitlement.entity_feature_id).toBe(TestFeature.Users);
				const users = findCustomerEntitlementByFeature({
					cusEnts: product!.customer_entitlements,
					featureId: TestFeature.Users,
					errorOnNotFound: true,
				});
				expect(users.replaceables).toHaveLength(1);
				expect(users.replaceables[0].delete_next_cycle).toBe(true);
			},
		});
		await advanceToNextInvoice({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
		});
		await pollUntilAsserted({
			timeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			fetch: readProduct,
			assert: (product) => {
				expect(product!.options).toContainEqual(
					expect.objectContaining({
						feature_id: TestFeature.Messages,
						quantity: 100,
					}),
				);
				for (const option of product!.options) {
					expect(option.upcoming_quantity == null).toBe(true);
				}
				const users = findCustomerEntitlementByFeature({
					cusEnts: product!.customer_entitlements,
					featureId: TestFeature.Users,
					errorOnNotFound: true,
				});
				expect(users.replaceables).toHaveLength(0);
				const messages = findCustomerEntitlementByFeature({
					cusEnts: product!.customer_entitlements,
					featureId: TestFeature.Messages,
					errorOnNotFound: true,
				});
				expect(Object.keys(messages.entities ?? {})).toEqual([entities[0].id]);
			},
		});
	},
	WEBHOOK_TEST_TIMEOUT_MS,
);
