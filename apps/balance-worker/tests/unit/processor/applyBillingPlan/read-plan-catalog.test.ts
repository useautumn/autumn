import { expect, mock, test } from "bun:test";
import {
	type ApplyBillingPlanCommand,
	applyMutation,
	computeApplyBillingPlan,
	toBillingPlanAddRolloversOp,
} from "@autumn/balance-engine";
import { RolloverExpiryDurationType } from "@autumn/shared";
import { readPlanCatalog } from "../../../../src/processor/commands/applyBillingPlan/decide/readPlanCatalog.js";
import type { PartitionProcessorScope } from "../../../../src/processor/types/partitionProcessor.js";
import {
	createCatalogFor,
	createCustomerEntitlement,
	createState,
	testIdentity,
	testOccurredAt,
} from "../../../fixtures/mutations.js";

test("a rollover-only plan loads the catalog and applies its capped rollover", () => {
	const state = createState({
		customerEntitlements: [createCustomerEntitlement({ id: "grant" })],
	});
	const catalog = createCatalogFor({ state });
	catalog.entitlements.ent_grant.rollover = {
		max: 20,
		duration: RolloverExpiryDurationType.Month,
		length: 1,
	};
	const readCatalog = mock(() => catalog);
	const scope = {
		ctx: { subjectHydrator: { readCatalog } },
	} as unknown as PartitionProcessorScope;
	const command: ApplyBillingPlanCommand = {
		schemaVersion: 1,
		type: "applyBillingPlan",
		commandId: "rollover-plan",
		requestId: "rollover-plan",
		identity: testIdentity,
		occurredAt: testOccurredAt,
		entityIds: [],
		expiringPooledBalanceIds: [],
		ops: toBillingPlanAddRolloversOp({
			id: "grant",
			rows: [
				{
					id: "roll_new",
					cus_ent_id: "grant",
					balance: 30,
					usage: 0,
					expires_at: testOccurredAt + 1000,
					entities: {},
				},
			],
		}),
	};
	const loadedCatalog = readPlanCatalog({
		scope,
		command,
		customer: state,
		parts: [],
	});
	expect(loadedCatalog).toBeDefined();
	expect(readCatalog).toHaveBeenCalledWith({ state });
	const mutation = computeApplyBillingPlan({
		command,
		state,
		catalog: loadedCatalog,
	});
	expect(applyMutation({ state, mutation }).rollovers).toMatchObject([
		{ id: "roll_new", balance: 20 },
	]);
});
