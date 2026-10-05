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
import { FeatureUsageType } from "@autumn/shared";
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

const deductInboxes = ({
	customerEntitlements,
	value,
	overageBehavior,
}: {
	customerEntitlements: WorkerCustomerEntitlement[];
	value: number;
	overageBehavior: "cap" | "overflow";
}) => {
	const state = createSubjectState({
		identity,
		customerProducts: [createCustomerProduct()],
		customerEntitlements,
	});
	const catalog = createCatalogFor({ state });
	for (const feature of Object.values(catalog.features))
		feature.config = { usage_type: FeatureUsageType.Continuous };

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
