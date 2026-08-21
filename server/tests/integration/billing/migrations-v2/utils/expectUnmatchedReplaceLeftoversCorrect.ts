import {
	type ApiCustomerV5,
	EntInterval,
	ResetInterval,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { ScenarioCtx } from "../batch-migrations/batchTestUtils";
import { expectFeatureRowUnchanged } from "../batch-migrations/paidRowTestUtils";

export const CATALOG_MESSAGES = 100;
export const CUSTOM_1K_MESSAGES = 1000;
export const REPLACEMENT_MESSAGES = 200;
export const LIFETIME_MESSAGES = 50;

export const unmatchedReplaceLeftoverCustomize = ({
	fromIncluded = CATALOG_MESSAGES,
	toIncluded = REPLACEMENT_MESSAGES,
	lifetimeIncluded = LIFETIME_MESSAGES,
}: {
	fromIncluded?: number;
	toIncluded?: number;
	lifetimeIncluded?: number;
} = {}) => ({
	remove_items: [
		{
			feature_id: TestFeature.Messages,
			interval: ResetInterval.Month,
			included: fromIncluded,
		},
	],
	add_items: [
		itemsV2.monthlyMessages({ included: toIncluded }),
		itemsV2.dashboard(),
		{
			feature_id: TestFeature.Messages,
			included: lifetimeIncluded,
			reset: { interval: ResetInterval.OneOff },
		},
	],
});

/** 1k monthly spared; leftover boolean + lifetime still land. */
export const expectUnmatchedReplaceLeftoversCorrect = async ({
	ctx,
	autumn,
	customerId,
	planId,
	beforeMonthly,
	monthlyGranted = CUSTOM_1K_MESSAGES,
	lifetimeGranted = LIFETIME_MESSAGES,
}: {
	ctx: ScenarioCtx;
	autumn: AutumnInt;
	customerId: string;
	planId: string;
	beforeMonthly: { id: string; entitlement_id: string };
	monthlyGranted?: number;
	lifetimeGranted?: number;
}) => {
	await expectFeatureRowUnchanged({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
		beforeRowId: beforeMonthly.id,
		beforeEntitlementId: beforeMonthly.entitlement_id,
		balance: monthlyGranted,
		interval: EntInterval.Month,
	});

	await expectBalanceCorrect({
		customerId,
		autumn,
		featureId: TestFeature.Messages,
		granted: monthlyGranted + lifetimeGranted,
		remaining: monthlyGranted + lifetimeGranted,
		usage: 0,
		planId,
		breakdownCount: 2,
		breakdown: {
			[ResetInterval.Month]: {
				included_grant: monthlyGranted,
				remaining: monthlyGranted,
			},
			[ResetInterval.OneOff]: {
				included_grant: lifetimeGranted,
				remaining: lifetimeGranted,
			},
		},
	});

	const customer = await autumn.customers.get<ApiCustomerV5>(customerId);
	expectFlagCorrect({
		customer,
		featureId: TestFeature.Dashboard,
		planId,
	});
};
