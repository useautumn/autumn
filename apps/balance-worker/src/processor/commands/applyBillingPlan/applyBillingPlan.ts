import {
	type ApplyBillingPlanRequest,
	parseApplyBillingPlanRequest,
} from "@autumn/balance-engine";
import type { ApplyBillingPlanReply } from "@autumn/balance-worker-client/protocol";
import type { PartitionProcessorScope } from "../../types/partitionProcessor.js";
import { serializeCustomerPlan } from "./customerPlans/serializeCustomerPlan.js";
import { decidePlan } from "./decide/decidePlan.js";
import { ensurePlanCatalog } from "./ensure/ensurePlanCatalog.js";
import { ensurePlanSubjects } from "./ensure/ensurePlanSubjects.js";
import { withExpiringPooledBalances } from "./ensure/withExpiringPooledBalances.js";
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
	return serializeCustomerPlan({
		scope,
		command,
		run: async () => {
			await ensurePlanSubjects({ scope, command });
			await ensurePlanCatalog({ scope, command });
			const planned = await withExpiringPooledBalances({ scope, command });
			const decided = await decidePlan({ scope, command: planned });
			return replyOnceStored({ scope, decided });
		},
	});
}
