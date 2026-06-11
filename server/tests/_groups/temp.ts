import type { TestGroup } from "./types";

const activeTempPaths = [
	"integration/balances/usage-windows/usage-window-enforcement.test.ts",
	"integration/balances/usage-windows/usage-window-own-feature.test.ts",
	"integration/balances/usage-windows/usage-window-persistence.test.ts",
	"integration/balances/usage-windows/usage-window-reset.test.ts",
	"integration/balances/usage-windows/plan-changes/plan-change-upgrade.test.ts",
	"integration/balances/usage-windows/plan-changes/plan-change-anchor.test.ts",
	"integration/balances/usage-windows/plan-changes/plan-change-replacement.test.ts",
	"integration/balances/usage-windows/plan-changes/plan-change-scheduled.test.ts",
	"integration/balances/usage-windows/plan-changes/plan-change-update.test.ts",
	"integration/balances/usage-windows/usage-window-sync.test.ts",
	"integration/balances/usage-windows/usage-window-api.test.ts",
	"integration/balances/usage-windows/usage-window-check.test.ts",
	"integration/balances/usage-windows/usage-window-lock.test.ts",
	"unit/full-subject-cache/setSharedFullSubjectBalances.test.ts",
	"unit/usage-windows/buildUsageWindowKey.test.ts",
	"unit/usage-windows/computeUsageWindowRolls.test.ts",
	"unit/usage-windows/fullSubjectToUsageWindowLimits.test.ts",
	"unit/usage-windows/getUsageWindowBounds.test.ts",
	"unit/usage-windows/pickAnchorCustomerEntitlementId.test.ts",
];

export const temp: TestGroup = {
	name: "temp",
	description: "usage-windows PR tests (uw-1-storage review)",
	tier: "domain",
	paths: activeTempPaths,
	maxConcurrency: 2,
};
