import { afterAll, describe, expect, mock, test } from "bun:test";
import { fullCustomerToFullSubject } from "@autumn/shared";
import { customerEntitlements } from "@tests/utils/fixtures/db/customerEntitlements.js";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts.js";
import { customers } from "@tests/utils/fixtures/db/customers.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

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

import { overlayAttachRuntimeBalances } from "@/internal/billing/v2/actions/attach/setup/overlayAttachRuntimeBalances.js";
import { mockModuleWithRestore } from "../../utils/mockModuleWithRestore.js";

describe("attach runtime balance overlay", () => {
	test("reads live Redis balances for attach calculations", async () => {
		const postgresCustomerEntitlement = customerEntitlements.create({
			id: "cus_ent_runtime_read",
			featureId: "messages",
			featureName: "Messages",
			allowance: 100,
			balance: 100,
			customerProductId: "product_runtime_read",
		});
		const runtimeCustomerEntitlement = structuredClone(
			postgresCustomerEntitlement,
		);
		runtimeCustomerEntitlement.balance = 95;
		const postgresFullCustomer = customers.create({
			customerProducts: [
				customerProducts.create({
					id: "product_runtime_read",
					customerEntitlements: [postgresCustomerEntitlement],
				}),
			],
		});
		runtimeFullCustomer = customers.create({
			customerProducts: [
				customerProducts.create({
					id: "product_runtime_read",
					customerEntitlements: [runtimeCustomerEntitlement],
				}),
			],
		});

		const result = await overlayAttachRuntimeBalances({
			ctx: { skipCache: false } as AutumnContext,
			fullCustomer: postgresFullCustomer,
		});

		expect(cachedSubjectCalls[cachedSubjectCalls.length - 1]).toMatchObject({
			runLazyResets: false,
			source: "setupAttachBillingContext",
		});
		expect(result.customer_products[0]?.customer_entitlements[0]?.balance).toBe(
			95,
		);
	});
});

afterAll(() => {
	mock.restore();
});
