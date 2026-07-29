import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Organization, OrgConfig } from "@autumn/shared";

const mockState = {
	disableOverageBillingFlags: {} as Record<string, string[]>,
};

mock.module("@/internal/misc/featureFlags/featureFlagStore.js", () => ({
	getDisableOverageBillingCustomers: ({ orgId }: { orgId: string }) => {
		return mockState.disableOverageBillingFlags[orgId] ?? [];
	},
}));

import { shouldDisableOverageBilling } from "@/external/stripe/webhookHandlers/common/shouldDisableOverageBilling";

const makeOrg = ({
	disableOverageBilling = false,
}: {
	disableOverageBilling?: boolean;
} = {}): Organization =>
	({
		id: "org_123",
		slug: "test-org",
		name: "Test Org",
		config: {
			disable_overage_billing: disableOverageBilling,
		} as OrgConfig,
		master: null,
	}) as unknown as Organization;

describe("shouldDisableOverageBilling", () => {
	beforeEach(() => {
		mockState.disableOverageBillingFlags = {};
	});

	test("uses org disable_overage_billing when customer config is unset", () => {
		expect(
			shouldDisableOverageBilling({
				org: makeOrg({ disableOverageBilling: true }),
				customerId: "cus_abc",
			}),
		).toBe(true);

		expect(
			shouldDisableOverageBilling({
				org: makeOrg({ disableOverageBilling: false }),
				customerId: "cus_abc",
			}),
		).toBe(false);
	});

	test("customer config false overrides org disable_overage_billing=true", () => {
		expect(
			shouldDisableOverageBilling({
				org: makeOrg({ disableOverageBilling: true }),
				customerId: "cus_abc",
				customerConfig: { disable_overage_billing: false },
			}),
		).toBe(false);
	});

	test("customer config false overrides edge-config disablement", () => {
		mockState.disableOverageBillingFlags = {
			org_123: ["cus_abc"],
		};

		expect(
			shouldDisableOverageBilling({
				org: makeOrg({ disableOverageBilling: false }),
				customerId: "cus_abc",
				customerConfig: { disable_overage_billing: false },
			}),
		).toBe(false);
	});

	test("customer config true overrides org disable_overage_billing=false", () => {
		expect(
			shouldDisableOverageBilling({
				org: makeOrg({ disableOverageBilling: false }),
				customerId: "cus_abc",
				customerConfig: { disable_overage_billing: true },
			}),
		).toBe(true);
	});

	test("edge config disables overage billing before org config", () => {
		mockState.disableOverageBillingFlags = {
			org_123: ["cus_abc"],
		};

		expect(
			shouldDisableOverageBilling({
				org: makeOrg({ disableOverageBilling: false }),
				customerId: "cus_abc",
			}),
		).toBe(true);

		expect(
			shouldDisableOverageBilling({
				org: makeOrg({ disableOverageBilling: false }),
				customerId: "cus_other",
			}),
		).toBe(false);
	});
});
