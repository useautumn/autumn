import { expect } from "bun:test";
import type { CreatePlanItemParamsV1Input } from "@autumn/shared";
import type { Operations } from "@autumn/shared/api/migrations/operations/operations.js";
import { runChunkedMigration } from "@tests/integration/billing/migrations-v2/utils/runChunkedMigration";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	expectBatchLane,
	readRepointableCustomerPlanRow,
} from "../utils/versionRepointTestUtils";

type MigrationClient = Parameters<
	typeof runChunkedMigration
>[0]["migrationClient"];

/** Plans that mint versions must not collide with leftovers from prior runs. */
export const uniqueStem = (label: string) =>
	`${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const versionOperations = ({
	planId,
}: {
	planId: string;
}): Operations => ({
	customer: [
		{
			type: "update_plan" as const,
			plan_filter: { plan_id: planId, version: 1 },
			version: 2,
		},
	],
});

/** Items MUST be `itemsV2` shapes — the route's params schema silently strips
 * internal ProductItem fields, minting an empty definition. */
export const mintPlanVersion = ({
	autumnV2_3,
	planId,
	items,
}: {
	autumnV2_3: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
	items: CreatePlanItemParamsV1Input[];
}) =>
	autumnV2_3.post("/plans.update", {
		plan_id: planId,
		force_version: true,
		items,
	});

export const migrateVersionOnBatchLane = async ({
	ctx,
	migrationClient,
	migrationId,
	planId,
}: {
	ctx: AutumnContext;
	migrationClient: MigrationClient;
	migrationId: string;
	planId: string;
}) => {
	const { result } = await runChunkedMigration({
		ctx,
		migrationClient,
		migrationId,
		filter: { customer: { plan: { plan_id: planId, version: 1 } } },
		operations: versionOperations({ planId }),
		noBillingChanges: true,
	});
	expectBatchLane({ result });
};

/** `limit` makes the run batch-ineligible, forcing the per-customer lane. */
export const migrateVersionOnPerCustomerLane = async ({
	ctx,
	migrationClient,
	migrationId,
	planId,
	customerId,
}: {
	ctx: AutumnContext;
	migrationClient: MigrationClient;
	migrationId: string;
	planId: string;
	customerId: string;
}) => {
	const { result } = await runChunkedMigration({
		ctx,
		migrationClient,
		migrationId,
		filter: { customer: { plan: { plan_id: planId, version: 1 } } },
		operations: versionOperations({ planId }),
		noBillingChanges: true,
		controls: { only: [customerId], limit: 1 },
	});
	expect(result?.lane).toBe("per_customer");
};

export const expectActivePlanVersion = async ({
	ctx,
	customerId,
	planId,
	version,
}: {
	ctx: AutumnContext;
	customerId: string;
	planId: string;
	version: number;
}) => {
	const row = await readRepointableCustomerPlanRow({ ctx, customerId, planId });
	expect(row.version).toBe(version);
};
