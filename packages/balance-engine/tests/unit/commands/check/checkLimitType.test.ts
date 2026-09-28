import { describe, expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import {
	computeCheck,
	createSubjectState,
	subjectStateToFullSubject,
	type WorkerCustomer,
	type WorkerCustomerEntitlement,
} from "../../../../src/balanceEngine.js";
import { customerWith } from "../../deduction/deductionFixtures.js";
import {
	createCatalogFor,
	createCheckCommand,
	createCustomerEntitlement,
	createCustomerProduct,
	identity,
} from "../../engineFixtures.js";

/** Which limit a refused check ran into, named the way the limit_reached webhook names it. */

const ALLOWANCE = 1000;

const withOverage = (
	customerEntitlement: WorkerCustomerEntitlement,
): WorkerCustomerEntitlement => ({
	...customerEntitlement,
	usage_allowed: true,
});

const checkOn = ({
	customer,
	customerEntitlements,
	requiredBalance = 1,
	overageCap,
}: {
	customer?: WorkerCustomer;
	customerEntitlements: WorkerCustomerEntitlement[];
	requiredBalance?: number;
	/** The most the plan lets usage run to, in total: the allowance plus the overage it sells. */
	overageCap?: number;
}) => {
	const state = createSubjectState({
		identity,
		customer,
		customerProducts: [createCustomerProduct()],
		customerEntitlements,
	});
	const catalog = createCatalogFor({ state });
	if (overageCap !== undefined) {
		for (const entitlement of Object.values(catalog.entitlements)) {
			entitlement.usage_limit = overageCap;
		}
	}
	return computeCheck({
		fullSubject: subjectStateToFullSubject({ state, catalog }),
		command: createCheckCommand({ requiredBalance }),
	});
};

describe("the limit a refused check ran into", () => {
	test("an allowed check ran into none", () => {
		const result = checkOn({
			customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
		});

		expect(result.allowed).toBe(true);
		expect(result.limitType).toBeNull();
	});

	test("an exhausted allowance with no overage is the included limit", () => {
		const result = checkOn({
			customerEntitlements: [createCustomerEntitlement({ balance: 0 })],
		});

		expect(result.allowed).toBe(false);
		expect(result.limitType).toBe("included");
	});

	test("asking for more than the allowance has left is the included limit", () => {
		const result = checkOn({
			customerEntitlements: [createCustomerEntitlement({ balance: 3 })],
			requiredBalance: 4,
		});

		expect(result.limitType).toBe("included");
	});

	test("overage switched off by a control is the included limit, even on an overage plan", () => {
		const result = checkOn({
			customer: customerWith({
				overage_allowed: [{ feature_id: "messages", enabled: false }],
			}),
			customerEntitlements: [
				withOverage(createCustomerEntitlement({ balance: 0 })),
			],
		});

		expect(result.allowed).toBe(false);
		expect(result.limitType).toBe("included");
	});

	test("uncapped overage is never refused", () => {
		const result = checkOn({
			customerEntitlements: [
				withOverage(createCustomerEntitlement({ balance: 0 })),
			],
			requiredBalance: 1_000_000,
		});

		expect(result.allowed).toBe(true);
		expect(result.limitType).toBeNull();
	});

	test("overage that has reached what the plan sells is the max purchase limit", () => {
		const result = checkOn({
			customerEntitlements: [
				withOverage(createCustomerEntitlement({ balance: -5 })),
			],
			overageCap: ALLOWANCE + 5,
		});

		expect(result.allowed).toBe(false);
		expect(result.limitType).toBe("max_purchase");
	});

	test("overage with room left under the plan's cap is allowed", () => {
		const result = checkOn({
			customerEntitlements: [
				withOverage(createCustomerEntitlement({ balance: -4 })),
			],
			overageCap: ALLOWANCE + 5,
		});

		expect(result.allowed).toBe(true);
	});

	test("overage that has reached the customer's spend limit is the spend limit", () => {
		const result = checkOn({
			customer: customerWith({
				spend_limits: [
					{ feature_id: "messages", enabled: true, overage_limit: 5 },
				],
			}),
			customerEntitlements: [
				withOverage(createCustomerEntitlement({ balance: -5 })),
			],
		});

		expect(result.allowed).toBe(false);
		expect(result.limitType).toBe("spend_limit");
	});

	test("a spend limit outranks the plan's own cap when both are set", () => {
		const result = checkOn({
			customer: customerWith({
				spend_limits: [
					{ feature_id: "messages", enabled: true, overage_limit: 5 },
				],
			}),
			customerEntitlements: [
				withOverage(createCustomerEntitlement({ balance: -5 })),
			],
			overageCap: ALLOWANCE + 5,
		});

		expect(result.limitType).toBe("spend_limit");
	});

	test("a disabled spend limit is not a limit", () => {
		const result = checkOn({
			customer: customerWith({
				spend_limits: [
					{ feature_id: "messages", enabled: false, overage_limit: 5 },
				],
			}),
			customerEntitlements: [
				withOverage(createCustomerEntitlement({ balance: -5 })),
			],
		});

		expect(result.allowed).toBe(true);
	});

	test("a windowed usage cap that is spent is the usage limit, whatever balance is left", () => {
		const result = checkOn({
			customer: customerWith({
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit: 0,
						interval: ResetInterval.Day,
					},
				],
			}),
			customerEntitlements: [createCustomerEntitlement({ balance: 10 })],
		});

		expect(result.allowed).toBe(false);
		expect(result.limitType).toBe("usage_limit");
	});

	test("a usage cap outranks an exhausted allowance when both would refuse", () => {
		const result = checkOn({
			customer: customerWith({
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit: 0,
						interval: ResetInterval.Day,
					},
				],
			}),
			customerEntitlements: [createCustomerEntitlement({ balance: 0 })],
		});

		expect(result.limitType).toBe("usage_limit");
	});

	test("a usage cap with room left does not take the blame for an exhausted allowance", () => {
		const result = checkOn({
			customer: customerWith({
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit: 100,
						interval: ResetInterval.Day,
					},
				],
			}),
			customerEntitlements: [createCustomerEntitlement({ balance: 0 })],
		});

		expect(result.limitType).toBe("included");
	});

	test("a feature the customer does not hold ran into no limit", () => {
		const result = checkOn({ customerEntitlements: [] });

		expect(result.allowed).toBe(false);
		expect(result.reason).toBe("feature_not_attached");
		expect(result.limitType).toBeNull();
	});
});
