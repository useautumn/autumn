/**
 * The overage draw's order: a row with its own overage (a usage price) takes
 * overage before a free allocated grant, which may run over only when nothing
 * priced can.
 *
 * Red (before):  overage lands on the first row in deduction order, the free
 *                plan's grant, so the priced add-on never bills.
 * Green (after): overage lands on the priced add-on.
 */

import { describe, expect, test } from "bun:test";
import {
	BillingInterval,
	BillWhen,
	FeatureUsageType,
	PriceType,
} from "@autumn/shared";
import {
	createSubjectState,
	subjectStateToFullSubject,
	type WorkerCustomerEntitlement,
} from "../../../src/balanceEngine.js";
import { deduct } from "../../../src/deduction/deduct.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
	occurredAt,
	org,
} from "../engineFixtures.js";
import { balancesAfter, createDeductionRequest } from "./deductionFixtures.js";

const freeGrant = ({
	balance,
}: {
	balance: number;
}): WorkerCustomerEntitlement =>
	createCustomerEntitlement({ id: "free", featureId: "inboxes", balance });

const pricedAddOn = ({
	balance,
}: {
	balance: number;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({ id: "addon", featureId: "inboxes", balance }),
	usage_allowed: true,
	created_at: occurredAt + 1,
});

/** A prepaid-priced row without its own overage: only an overflow draw may take it below zero. It sorts first in deduction order. */
const prepaidGrant = ({
	balance,
}: {
	balance: number;
}): WorkerCustomerEntitlement => ({
	...createCustomerEntitlement({
		id: "prepaid",
		featureId: "inboxes",
		balance,
	}),
	created_at: occurredAt - 1,
});

const deductInboxes = ({
	customerEntitlements,
	value,
	overageBehavior,
}: {
	customerEntitlements: WorkerCustomerEntitlement[];
	value: number;
	overageBehavior: "cap" | "overflow";
}) => {
	const hasPrepaidGrant = customerEntitlements.some(
		(customerEntitlement) => customerEntitlement.id === "prepaid",
	);
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerPrices: hasPrepaidGrant
			? [
					{
						id: "cpr_prepaid",
						internal_customer_id: "cus_internal_1",
						customer_product_id: "cp_1",
						price_id: "price_prepaid",
						created_at: occurredAt,
					},
				]
			: [],
		customerEntitlements,
	});
	const catalog = createCatalogFor({ state });
	for (const feature of Object.values(catalog.features))
		feature.config = { usage_type: FeatureUsageType.Continuous };
	if (hasPrepaidGrant) {
		catalog.prices.price_prepaid = {
			id: "price_prepaid",
			internal_product_id: "prod_internal_pro",
			entitlement_id: "ent_prepaid",
			proration_config: null,
			config: {
				type: PriceType.Usage,
				bill_when: BillWhen.InAdvance,
				billing_units: 1,
				internal_feature_id: "feat_inboxes",
				feature_id: "inboxes",
				usage_tiers: [],
				interval: BillingInterval.Month,
			},
		};
	}

	return deduct({
		fullSubject: subjectStateToFullSubject({ state, catalog }),
		request: createDeductionRequest({
			org,
			featureId: "inboxes",
			overageBehavior,
			value,
		}),
	});
};

describe("overage priority", () => {
	for (const overageBehavior of ["cap", "overflow"] as const) {
		test.concurrent(
			`${overageBehavior}: overage past a free continuous grant lands on the priced add-on`,
			() => {
				const outcome = deductInboxes({
					customerEntitlements: [
						freeGrant({ balance: 3 }),
						pricedAddOn({ balance: 0 }),
					],
					value: 5,
					overageBehavior,
				});

				expect(outcome).toMatchObject({ appliedValue: 5, remaining: 0 });
				expect(balancesAfter(outcome)).toEqual([
					["free", { balance: 0 }],
					["addon", { balance: -2 }],
				]);
			},
		);
	}

	test.concurrent(
		"overflow: the priced add-on leads, ahead of a row only overflow admits",
		() => {
			const outcome = deductInboxes({
				customerEntitlements: [
					prepaidGrant({ balance: 0 }),
					freeGrant({ balance: 3 }),
					pricedAddOn({ balance: 0 }),
				],
				value: 5,
				overageBehavior: "overflow",
			});

			expect(outcome).toMatchObject({ appliedValue: 5, remaining: 0 });
			expect(balancesAfter(outcome)).toEqual([
				["free", { balance: 0 }],
				["addon", { balance: -2 }],
			]);
		},
	);

	test.concurrent(
		"overflow: a free continuous grant runs over before a row only overflow admits",
		() => {
			const outcome = deductInboxes({
				customerEntitlements: [
					prepaidGrant({ balance: 0 }),
					freeGrant({ balance: 3 }),
				],
				value: 5,
				overageBehavior: "overflow",
			});

			expect(outcome).toMatchObject({ appliedValue: 5, remaining: 0 });
			expect(balancesAfter(outcome)).toEqual([["free", { balance: -2 }]]);
		},
	);

	test.concurrent(
		"cap: a free continuous grant still runs over when nothing is priced",
		() => {
			const outcome = deductInboxes({
				customerEntitlements: [freeGrant({ balance: 3 })],
				value: 5,
				overageBehavior: "cap",
			});

			expect(outcome).toMatchObject({ appliedValue: 5, remaining: 0 });
			expect(balancesAfter(outcome)).toEqual([["free", { balance: -2 }]]);
		},
	);

	test.concurrent("a refund keeps the deduction order", () => {
		const outcome = deductInboxes({
			customerEntitlements: [
				freeGrant({ balance: 0 }),
				pricedAddOn({ balance: -2 }),
			],
			value: -3,
			overageBehavior: "cap",
		});

		expect(outcome).toMatchObject({ appliedValue: -3, remaining: 0 });
		expect(balancesAfter(outcome)).toEqual([
			["free", { balance: 1 }],
			["addon", { balance: 0 }],
		]);
	});
});
