import { describe, expect, test } from "bun:test";
import type { FullSubject } from "@autumn/shared";
import { applyDeductionUpdateToFullSubject } from "@/internal/balances/utils/deductionV2/applyDeductionUpdateToFullSubject.js";
import { applyRolloverUpdatesToFullSubject } from "@/internal/balances/utils/deductionV2/applyRolloverUpdatesToFullSubject.js";
import { applyUsageWindowUpdatesToFullSubject } from "@/internal/balances/utils/deductionV2/applyUsageWindowUpdatesToFullSubject.js";
import { snapshotFullSubjectBalanceState } from "@/internal/balances/utils/deductionV2/snapshotFullSubjectBalanceState.js";

const buildFullSubject = (): FullSubject =>
	({
		subjectType: "customer",
		customerId: "customer_1",
		internalCustomerId: "internal_customer_1",
		customer: { id: "internal_customer_1" },
		customer_products: [
			{
				id: "cus_product_1",
				customer_entitlements: [
					{
						id: "cus_ent_1",
						balance: 10,
						additional_balance: 0,
						adjustment: 0,
						entities: null,
						replaceables: [],
						rollovers: [
							{
								id: "rollover_1",
								balance: 3,
								usage: 0,
								entities: null,
							},
						],
					},
				],
			},
		],
		extra_customer_entitlements: [],
		pooled_customer_entitlements: [],
		usage_windows: [
			{
				id: "window_1",
				feature_id: "messages",
				usage: 1,
			},
		],
		invoices: [],
	}) as unknown as FullSubject;

describe("snapshotFullSubjectBalanceState", () => {
	test("keeps rollback and webhook state isolated while sharing static data", () => {
		const fullSubject = buildFullSubject();
		const snapshot = snapshotFullSubjectBalanceState({ fullSubject });

		applyDeductionUpdateToFullSubject({
			fullSubject,
			customerEntitlementId: "cus_ent_1",
			update: {
				balance: 7,
				additional_balance: 0,
				adjustment: 0,
				entities: {},
				deducted: 3,
			},
		});
		applyRolloverUpdatesToFullSubject({
			fullSubject,
			rolloverUpdates: {
				rollover_1: { balance: 1, usage: 2, entities: {} },
			},
		});
		applyUsageWindowUpdatesToFullSubject({
			fullSubject,
			usageWindowsByFeatureId: {
				messages: [
					{
						...fullSubject.usage_windows![0]!,
						usage: 2,
					},
				],
			},
		});

		expect(snapshot.customer).toBe(fullSubject.customer);
		expect(
			snapshot.customer_products[0]?.customer_entitlements[0]?.balance,
		).toBe(10);
		expect(
			snapshot.customer_products[0]?.customer_entitlements[0]?.rollovers[0]
				?.balance,
		).toBe(3);
		expect(snapshot.usage_windows?.[0]?.usage).toBe(1);
	});
});
