import {
	type ApplyBillingPlanRequest,
	meteringIdentityToPartitionKey,
	parseApplyBillingPlanRequest,
} from "@autumn/balance-engine";
import type { ApplyBillingPlanReply } from "@autumn/balance-worker-client/protocol";
import { withResidentSubject } from "../../actions/withResidentSubject.js";
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
			const planned = await withExpiringPooledBalances({ scope, command });
			// An evict can land in any await before the decision, as for a track: hydrate again and retry once.
			const decided = await withResidentSubject({
				customerKey: meteringIdentityToPartitionKey({
					identity: command.identity,
				}),
				ensure: async () => {
					await ensurePlanSubjects({ scope, command });
					await ensurePlanCatalog({ scope, command });
				},
				attempt: () => decidePlan({ scope, command: planned }),
			});
			return replyOnceStored({ scope, decided });
		},
	});
}
