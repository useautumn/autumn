import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { appendToExtraLogs } from "@/utils/logging/addToExtraLogs.js";

type BillingLogKey =
	| "billingContext"
	| "autumnBillingPlan"
	| "stripeBillingPlan"
	| "stripeBillingResult";

type MigrationBillingLogKey =
	| "migrationBillingContexts"
	| "migrationAutumnBillingPlans"
	| "migrationStripeBillingPlans"
	| "migrationStripeBillingResults";

const migrationLogKeyByBillingLogKey: Record<
	BillingLogKey,
	MigrationBillingLogKey
> = {
	billingContext: "migrationBillingContexts",
	autumnBillingPlan: "migrationAutumnBillingPlans",
	stripeBillingPlan: "migrationStripeBillingPlans",
	stripeBillingResult: "migrationStripeBillingResults",
};

export const appendMigrationBillingLog = ({
	ctx,
	key,
	log,
}: {
	ctx: AutumnContext;
	key: BillingLogKey;
	log: (ctx: AutumnContext) => void;
}) => {
	const captureCtx: AutumnContext = {
		...ctx,
		extraLogs: {},
	};

	log(captureCtx);

	const value = captureCtx.extraLogs[key];
	if (value === undefined) return;

	appendToExtraLogs({
		ctx,
		key: migrationLogKeyByBillingLogKey[key],
		value,
	});
};
