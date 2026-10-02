import { expect, test } from "bun:test";
import {
	findCustomerEntitlementByFeature,
	OnDecrease,
	OnIncrease,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/expectStripeSubscriptionCorrect";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { products } from "@tests/utils/fixtures/products";
import { pollUntilAsserted } from "@tests/utils/genUtils";
import {
	WEBHOOK_SETTLE_TIMEOUT_MS,
	WEBHOOK_TEST_TIMEOUT_MS,
} from "@tests/utils/pollableCustomerExpect";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import {
	constructArrearProratedItem,
	constructPrepaidItem,
} from "@/utils/scriptUtils/constructItem";

const expectLinkedPrepaidState = ({
	ctx,
	customerProductId,
	entityId,
	remaining,
	replaceableCount,
	rolloverBalances,
}: {
	ctx: TestContext;
	customerProductId: string;
	entityId: string;
	remaining: number;
	replaceableCount: number;
	rolloverBalances: number[];
}) =>
	pollUntilAsserted({
		timeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
		fetch: () =>
			CusProductService.getFull({ db: ctx.db, id: customerProductId }),
		assert: (customerProduct) => {
			expect(customerProduct).toBeDefined();
			expect(customerProduct!.internal_entity_id).toBeNull();
			const messages = findCustomerEntitlementByFeature({
				cusEnts: customerProduct!.customer_entitlements,
				featureId: TestFeature.Messages,
				errorOnNotFound: true,
			});
			const users = findCustomerEntitlementByFeature({
				cusEnts: customerProduct!.customer_entitlements,
				featureId: TestFeature.Users,
				errorOnNotFound: true,
			});
			expect(messages.entitlement.entity_feature_id).toBe(TestFeature.Users);
			expect(messages.entities?.[entityId]?.balance).toBe(remaining);
			expect(
				messages.rollovers.map(
					(rollover) => rollover.entities[entityId]?.balance,
				),
			).toEqual(rolloverBalances);
			expect(users.replaceables).toHaveLength(replaceableCount);
			for (const replaceable of users.replaceables) {
				expect(replaceable.delete_next_cycle).toBe(true);
			}
		},
	});

for (const removeSeat of [false, true]) {
	test.concurrent(
		`invoice.created prepaid linked rollover: removed seat ${removeSeat} preserves the retained entity's purchased allowance`,
		async () => {
			const customerId = `invoice-prepaid-linked-rollover-${removeSeat}`;
			const pro = products.base({
				id: "prepaid-with-seats",
				items: [
					constructArrearProratedItem({
						featureId: TestFeature.Users,
						pricePerUnit: 50,
						includedUsage: 0,
						config: {
							on_increase: OnIncrease.BillImmediately,
							on_decrease: OnDecrease.None,
						},
					}),
					constructPrepaidItem({
						featureId: TestFeature.Messages,
						entityFeatureId: TestFeature.Users,
						includedUsage: 0,
						billingUnits: 100,
						price: 10,
						rolloverConfig: {
							max_percentage: 100,
							length: 1,
							duration: RolloverExpiryDurationType.Month,
						},
					}),
				],
			});
			const { autumnV1, autumnV2_4, ctx, customer, entities, testClockId } =
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
						s.track({
							featureId: TestFeature.Messages,
							value: 50,
							entityIndex: 0,
						}),
					],
				});

			await expectBalanceCorrect({
				autumn: autumnV2_4,
				customerId,
				entityId: entities[0].id,
				featureId: TestFeature.Messages,
				remaining: 150,
				rollovers: [],
			});
			const customerProducts = await CusProductService.list({
				db: ctx.db,
				internalCustomerId: customer!.internal_id,
			});
			expect(customerProducts).toHaveLength(1);
			const customerProductId = customerProducts[0].id;
			await expectLinkedPrepaidState({
				ctx,
				customerProductId,
				entityId: entities[0].id,
				remaining: 150,
				replaceableCount: 0,
				rolloverBalances: [],
			});
			await expectCustomerInvoiceCorrect({
				autumn: autumnV1,
				customerId,
				count: 1,
				latestTotal: 120,
				latestStatus: "paid",
			});

			if (removeSeat) {
				await autumnV2_4.entities.delete(customerId, entities[1].id);
			}
			await expectLinkedPrepaidState({
				ctx,
				customerProductId,
				entityId: entities[0].id,
				remaining: 150,
				replaceableCount: removeSeat ? 1 : 0,
				rolloverBalances: [],
			});

			await advanceToNextInvoice({
				stripeCli: ctx.stripeCli,
				testClockId: testClockId!,
				beforeFinalize: async () =>
					expectCustomerInvoiceCorrect({
						autumn: autumnV1,
						customerId,
						settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
						count: 2,
						latestTotal: removeSeat ? 70 : 120,
					}),
			});
			await expectLinkedPrepaidState({
				ctx,
				customerProductId,
				entityId: entities[0].id,
				remaining: 200,
				replaceableCount: 0,
				rolloverBalances: [150],
			});
			await expectBalanceCorrect({
				autumn: autumnV2_4,
				customerId,
				entityId: entities[0].id,
				featureId: TestFeature.Messages,
				remaining: 350,
				rollovers: [{ balance: 150 }],
				settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			});
			await expectCustomerInvoiceCorrect({
				autumn: autumnV1,
				customerId,
				settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
				count: 2,
				latestTotal: removeSeat ? 70 : 120,
				latestStatus: "paid",
			});
			await expectStripeSubscriptionCorrect({ ctx, customerId });
		},
		WEBHOOK_TEST_TIMEOUT_MS,
	);
}
