/**
 * Tests for the edge config (S3-backed feature flag) override of skip_overage_submission.
 *
 * When the feature flag config has:
 *   { skipOverageSubmissionFlags: { "<org_id>": ["<customer_id>"] } }
 * then overage submission is skipped for that specific customer,
 * even if the org-level config flag is false.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// Create mutable mock state for controlling the feature flag store
const mockState = {
	skipOverageSubmissionFlags: {} as Record<string, string[]>,
};

// Mock the featureFlagStore module BEFORE importing the function under test
mock.module("@/internal/misc/featureFlags/featureFlagStore.js", () => ({
	getRuntimeFeatureFlags: () => mockState,
	getRuntimeFeatureFlagStatus: () => ({
		configured: true,
		healthy: true,
	}),
	getRuntimeFeatureFlag: () => false,
	getSkipOverageSubmissionCustomers: ({ orgId }: { orgId: string }) => {
		return mockState.skipOverageSubmissionFlags[orgId] ?? [];
	},
	updateFullFeatureFlagConfig: async () => {},
	getFeatureFlagConfigFromSource: () => Promise.resolve(mockState),
}));

// Now import the function under test AFTER mocking
import type { Organization, OrgConfig } from "@autumn/shared";
import { parseSkipOverageSubmissionFlag } from "@/internal/misc/featureFlags/parseSkipOverageSubmission";

const makeOrg = ({
	id,
	skipOverage = false,
}: {
	id: string;
	skipOverage?: boolean;
}): Organization =>
	({
		id,
		slug: "test-org",
		name: "Test Org",
		config: {
			skip_overage_submission: skipOverage,
		} as OrgConfig,
		master: null,
	}) as unknown as Organization;

describe("parseSkipOverageSubmissionFlag - edge config override", () => {
	beforeEach(() => {
		mockState.skipOverageSubmissionFlags = {};
	});

	test("returns true when customer is in edge config skipOverageSubmissionFlags (org flag false)", () => {
		const org = makeOrg({ id: "org_123", skipOverage: false });

		mockState.skipOverageSubmissionFlags = {
			org_123: ["cus_abc", "cus_def"],
		};

		const result = parseSkipOverageSubmissionFlag({
			org,
			customerId: "cus_abc",
		});

		expect(result).toBe(true);
	});

	test("returns false when customer is NOT in edge config and org flag is false", () => {
		const org = makeOrg({ id: "org_123", skipOverage: false });

		mockState.skipOverageSubmissionFlags = {
			org_123: ["cus_other"],
		};

		const result = parseSkipOverageSubmissionFlag({
			org,
			customerId: "cus_abc",
		});

		expect(result).toBe(false);
	});

	test("returns true when org flag is true (regardless of edge config)", () => {
		const org = makeOrg({ id: "org_456", skipOverage: true });

		mockState.skipOverageSubmissionFlags = {};

		const result = parseSkipOverageSubmissionFlag({
			org,
			customerId: "cus_xyz",
		});

		expect(result).toBe(true);
	});

	test("returns false when customerId is null and org flag is false", () => {
		const org = makeOrg({ id: "org_789", skipOverage: false });

		const result = parseSkipOverageSubmissionFlag({
			org,
			customerId: null,
		});

		expect(result).toBe(false);
	});

	test("returns true when customerId is null but org flag is true", () => {
		const org = makeOrg({ id: "org_789", skipOverage: true });

		const result = parseSkipOverageSubmissionFlag({
			org,
			customerId: null,
		});

		expect(result).toBe(true);
	});

	test("returns false when customer is in edge config for different org", () => {
		const org = makeOrg({ id: "org_456", skipOverage: false });

		mockState.skipOverageSubmissionFlags = {
			org_other: ["cus_abc"],
		};

		const result = parseSkipOverageSubmissionFlag({
			org,
			customerId: "cus_abc",
		});

		expect(result).toBe(false);
	});

	test("returns true when customer is in edge config with multiple customers", () => {
		const org = makeOrg({ id: "org_multi", skipOverage: false });

		mockState.skipOverageSubmissionFlags = {
			org_multi: ["cus_1", "cus_2", "cus_3"],
		};

		expect(parseSkipOverageSubmissionFlag({ org, customerId: "cus_1" })).toBe(
			true,
		);
		expect(parseSkipOverageSubmissionFlag({ org, customerId: "cus_2" })).toBe(
			true,
		);
		expect(parseSkipOverageSubmissionFlag({ org, customerId: "cus_3" })).toBe(
			true,
		);
	});

	test("edge config takes precedence over org flag being false", () => {
		const org = makeOrg({ id: "org_edge", skipOverage: false });

		mockState.skipOverageSubmissionFlags = {
			org_edge: ["special_customer"],
		};

		// This customer is in the edge config list
		expect(
			parseSkipOverageSubmissionFlag({
				org,
				customerId: "special_customer",
			}),
		).toBe(true);

		// Other customers are not skipped
		expect(
			parseSkipOverageSubmissionFlag({
				org,
				customerId: "regular_customer",
			}),
		).toBe(false);
	});
});
