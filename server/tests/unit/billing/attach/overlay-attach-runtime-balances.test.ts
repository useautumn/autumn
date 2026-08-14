import { afterAll, describe, expect, mock, test } from "bun:test";
import { fullCustomerToFullSubject } from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import { products } from "@tests/utils/fixtures/db/products.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { applyExistingStatesToCustomerProduct } from "@/internal/billing/v2/utils/initFullCustomerProduct/applyExisting/applyExistingStatesToCustomerProduct.js";

const cachedSubjectCalls: Record<string, unknown>[] = [];
let runtimeFullCustomer = customers.create({});

await mockModuleWithRestore(
	"@/internal/customers/cache/fullSubject/actions/getCachedFullSubject.js",
	() => ({
		getCachedFullSubject: async (args: Record<string, unknown>) => {
			cachedSubjectCalls.push(args);
			return {
				fullSubject: fullCustomerToFullSubject({
					fullCustomer: runtimeFullCustomer,
				}),
				subjectViewEpoch: 4,
			};
		},
	}),
);

import {
	copyAttachRuntimeBalanceFields,
	overlayAttachRuntimeBalances,
} from "@/internal/billing/v2/actions/attach/setup/overlayAttachRuntimeBalances.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

describe("attach runtime balance overlay", () => {
	test("keeps Postgres structure but takes mutable balance state from Redis", () => {
		const postgresCustomerEntitlement = customerEntitlements.create({
			id: "cus_ent_messages",
			featureId: "messages",
			featureName: "Messages",
			allowance: 100,
			balance: 100,
		});
		postgresCustomerEntitlement.next_reset_at = 2_000;
		postgresCustomerEntitlement.cache_version = 7;

		const runtimeCustomerEntitlement = structuredClone(
			postgresCustomerEntitlement,
		);
		runtimeCustomerEntitlement.balance = 95;
		runtimeCustomerEntitlement.adjustment = 10;
		runtimeCustomerEntitlement.next_reset_at = 1_000;
		runtimeCustomerEntitlement.cache_version = 6;

		const result = copyAttachRuntimeBalanceFields({
			postgresCustomerEntitlement,
			runtimeCustomerEntitlement,
		});

		expect(result.balance).toBe(95);
		expect(result.adjustment).toBe(10);
		expect(result.next_reset_at).toBe(2_000);
		expect(result.cache_version).toBe(7);
	});

	test("reads live balances from the Redis primary for attach calculations", async () => {
		const postgresCustomerEntitlement = customerEntitlements.create({
			id: "cus_ent_primary_read",
			featureId: "messages",
			featureName: "Messages",
			allowance: 100,
			balance: 100,
			customerProductId: "product_primary_read",
		});
		const runtimeCustomerEntitlement = structuredClone(
			postgresCustomerEntitlement,
		);
		runtimeCustomerEntitlement.balance = 95;
		const postgresFullCustomer = customers.create({
			customerProducts: [
				customerProducts.create({
					id: "product_primary_read",
					customerEntitlements: [postgresCustomerEntitlement],
				}),
			],
		});
		runtimeFullCustomer = customers.create({
			customerProducts: [
				customerProducts.create({
					id: "product_primary_read",
					customerEntitlements: [runtimeCustomerEntitlement],
				}),
			],
		});

		const result = await overlayAttachRuntimeBalances({
			ctx: { skipCache: false } as AutumnContext,
			fullCustomer: postgresFullCustomer,
		});

		expect(cachedSubjectCalls[cachedSubjectCalls.length - 1]).toMatchObject({
			readMaster: true,
		});
		expect(result.customer_products[0]?.customer_entitlements[0]?.balance).toBe(
			95,
		);
	});

	test("the existing carry calculation turns Redis A 95 into B 195", async () => {
		const postgresSourceEntitlement = customerEntitlements.create({
			id: "source_messages",
			customerProductId: "source_product",
			featureId: "messages",
			featureName: "Messages",
			allowance: 100,
			balance: 100,
		});
		const runtimeSourceEntitlement = structuredClone(postgresSourceEntitlement);
		runtimeSourceEntitlement.balance = 95;
		const sourceProduct = customerProducts.create({
			id: "source_product",
			productId: "pro",
			customerEntitlements: [postgresSourceEntitlement],
			product: products.createFull({
				id: "pro",
				entitlements: [postgresSourceEntitlement.entitlement],
			}),
		});
		runtimeFullCustomer = customers.create({
			customerProducts: [
				{
					...sourceProduct,
					customer_entitlements: [runtimeSourceEntitlement],
				},
			],
		});
		const overlaidCustomer = await overlayAttachRuntimeBalances({
			ctx: { skipCache: false } as AutumnContext,
			fullCustomer: customers.create({ customerProducts: [sourceProduct] }),
		});

		const targetEntitlement = customerEntitlements.create({
			id: "target_messages",
			customerProductId: "target_product",
			featureId: "messages",
			featureName: "Messages",
			allowance: 200,
			balance: 200,
		});
		const targetProduct = customerProducts.create({
			id: "target_product",
			productId: "premium",
			customerEntitlements: [targetEntitlement],
			product: products.createFull({
				id: "premium",
				entitlements: [targetEntitlement.entitlement],
			}),
		});
		const runtimeSourceProduct = overlaidCustomer.customer_products[0];
		expect(runtimeSourceProduct?.customer_entitlements[0]?.balance).toBe(95);

		applyExistingStatesToCustomerProduct({
			ctx: contexts.create({
				features: [postgresSourceEntitlement.entitlement.feature],
			}),
			fullCustomer: overlaidCustomer,
			customerProduct: targetProduct,
			existingUsagesConfig: {
				fromCustomerProduct: runtimeSourceProduct!,
				carryAllConsumableFeatures: true,
			},
		});

		expect(targetEntitlement.balance).toBe(195);
	});
});

afterAll(() => {
	mock.restore();
});
