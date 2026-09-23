import {
	type ApplyBillingPlanRequest,
	parseApplyBillingPlanRequest,
} from "@autumn/balance-engine";
import type { ApplyBillingPlanReply } from "@autumn/balance-worker-client/protocol";
import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";
import { decidePlan } from "./decidePlan.js";
import { ensurePlanCatalog } from "./ensurePlanCatalog.js";
import { ensurePlanSubjects } from "./planSubjects.js";
import { replyOnceStored } from "./replyOnceStored.js";
import { requirePostgresStore } from "./requirePostgresStore.js";

/** A billing plan's changes to a customer and the entities it names as one mutation, answered once Postgres holds them. */
export async function applyBillingPlan({
	scope,
	request,
}: {
	scope: PartitionProcessorScope;
	request: ApplyBillingPlanRequest;
}): Promise<ApplyBillingPlanReply> {
	const { command, catalogRows } = parseApplyBillingPlanRequest({
		input: request,
	});
	requirePostgresStore({ scope });
	scope.ctx.catalogCache.put({ rows: catalogRows });
	await ensurePlanSubjects({ scope, command });
	await ensurePlanCatalog({ scope, command });
	const decided = await decidePlan({ scope, command });
	return replyOnceStored({ scope, decided });
}
