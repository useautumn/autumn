import { expect } from "bun:test";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import type { AutumnInt } from "@/external/autumn/autumnCli.js";
import type { ScenarioCtx } from "../batch-migrations/batchTestUtils";
import {
	expectFeatureRowUnchanged,
	readScopedFeatureRow,
} from "../batch-migrations/paidRowTestUtils";

/** Spare: same cusEnt row and definition. Match: new definition, new grant. */
export const expectIncludedFilterOutcomeCorrect = async ({
	ctx,
	autumn,
	customerId,
	planId,
	featureId,
	before,
	granted,
	remaining,
	usage = 0,
	spared,
}: {
	ctx: ScenarioCtx;
	autumn: AutumnInt;
	customerId: string;
	planId: string;
	featureId: string;
	before: { id: string; entitlement_id: string };
	granted: number;
	remaining?: number;
	usage?: number;
	spared: boolean;
}) => {
	const balance = remaining ?? granted;
	if (spared) {
		await expectFeatureRowUnchanged({
			ctx,
			customerId,
			featureId,
			beforeRowId: before.id,
			beforeEntitlementId: before.entitlement_id,
			balance,
		});
	} else {
		const after = await readScopedFeatureRow({
			ctx,
			customerId,
			featureId,
		});
		expect(after.entitlement_id).not.toBe(before.entitlement_id);
		expect(after.balance).toBe(balance);
	}

	await expectBalanceCorrect({
		customerId,
		autumn,
		featureId,
		granted,
		remaining: balance,
		usage,
		planId,
		breakdownCount: 1,
	});
};
