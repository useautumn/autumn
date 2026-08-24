import { generateKsuid } from "@autumn/ksuid";
import type { TrackParams } from "@autumn/shared";
import type { BalanceDeductedFacts } from "../../../api/journal/facts/balanceDeducted.js";
import { BALANCE_DEDUCTED } from "../../../api/journal/facts/balanceDeducted.js";
import {
	LEDGER_ENTRY_SCHEMA_VERSION,
	type LedgerEntry,
} from "../../../api/journal/types/ledgerEntry.js";
import type { RowChange } from "../../../api/journal/types/rowChange.js";
import type { TrackContext } from "../actions/track/types/trackContext.js";
import type { TrackPlan } from "../actions/track/types/trackPlan.js";

const DEFAULT_VALUE = 1;

// Absolute after-values, so a consumer that applies the same entry twice lands
// in the same place.
const planToRowChanges = ({ plan }: { plan: TrackPlan }): RowChange[] =>
	Object.entries(plan.after).map(([id, settled]) => ({
		table: "customer_entitlements",
		op: "update",
		id,
		set: { balance: settled.balance, adjustment: settled.adjustment },
	}));

// What Tinybird's event row is built from. `skip_event` callers already own the
// event elsewhere, so the entry carries none.
const commandBodyToTrackedEvent = ({
	body,
	at,
}: {
	body: TrackParams;
	at: number;
}): BalanceDeductedFacts["event"] => {
	if (body.skip_event) return undefined;

	return {
		name: body.feature_id ?? body.event_name ?? "",
		value: body.value ?? DEFAULT_VALUE,
		timestamp: body.timestamp ? new Date(body.timestamp).getTime() : at,
		properties: body.properties,
		idempotency_key: body.idempotency_key,
	};
};

const trackPlanToFacts = ({
	trackContext,
	plan,
}: {
	trackContext: TrackContext;
	plan: TrackPlan;
}): BalanceDeductedFacts => ({
	requests: trackContext.requests.map(({ feature, amount }) => ({
		feature_id: feature.id,
		amount,
	})),
	deductions: plan.mutations,
	remaining_by_feature_id: plan.remainingByFeatureId,
	overage_behaviour: trackContext.options.overageBehaviour,
	event: commandBodyToTrackedEvent({
		body: trackContext.command.body,
		at: trackContext.command.at,
	}),
});

export const balancePlanToLedgerEntry = ({
	trackContext,
	plan,
	shardId,
	version,
}: {
	trackContext: TrackContext;
	plan: TrackPlan;
	shardId: number;
	version: number;
}): LedgerEntry => {
	const { command, subject } = trackContext;

	return {
		schema_version: LEDGER_ENTRY_SCHEMA_VERSION,
		id: generateKsuid({ prefix: "le_" }),
		org_id: command.org_id,
		env: command.env,
		customer_id: command.customer_id,
		internal_customer_id: subject.customer.internal_id,
		shard_id: shardId,
		version,
		at: command.at,
		// The one wall-clock read in the fold, and it feeds no decision.
		recorded_at: Date.now(),
		command: {
			id: command.id,
			kind: command.kind,
			api_version: command.api_version,
		},
		kind: BALANCE_DEDUCTED,
		changes: planToRowChanges({ plan }),
		facts: trackPlanToFacts({ trackContext, plan }),
	};
};
