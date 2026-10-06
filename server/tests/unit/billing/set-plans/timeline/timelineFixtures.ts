import { ms } from "@autumn/shared";
import { instanceKey } from "@/internal/billing/v2/actions/setPlans/timeline/savedTimeline/rowsToSavedTimeline";
import type { SetPlansPolicies } from "@/internal/billing/v2/actions/setPlans/timeline/types/setPlansPolicies";
import type { DesiredTimeline } from "@/internal/billing/v2/actions/setPlans/timeline/types/timeline";
import type { TimelineRow } from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineRow";
import type { DesiredSegment } from "@/internal/billing/v2/actions/setPlans/timeline/types/timelineSegment";

export const NOW = 1_800_000_000_000;
export const PAST = NOW - ms.days(20);
export const B = NOW + ms.days(30);
export const B2 = NOW + ms.days(40);
export const C = NOW + ms.days(60);

export type PlanKind = "main" | "addOn" | "free" | "oneOff";

export type TestPlan = {
	planId: string;
	kind: PlanKind;
	group?: string;
	isAddOn: boolean;
};

/** Add-on status is separate from pricing, so a free plan can be an add-on. */
export const plan = ({
	planId,
	kind = "main",
	group = "main",
	isAddOn = kind === "addOn",
}: {
	planId: string;
	kind?: PlanKind;
	group?: string;
	isAddOn?: boolean;
}): TestPlan => ({ planId, kind, group, isAddOn });

const replacementKeyOf = (testPlan: TestPlan) =>
	(testPlan.kind === "main" || testPlan.kind === "free") && !testPlan.isAddOn
		? (testPlan.group ?? "main")
		: testPlan.planId;

export const savedRow = ({
	id,
	plan: testPlan,
	hash = "h1",
	entity = null,
	startsAt = PAST,
	endsAt = null,
	scheduled,
	canceling = false,
	pastDue = false,
	unbilledByStripe = false,
	onLiveSubscription,
	externalId = null,
}: {
	id: string;
	plan: TestPlan;
	hash?: string;
	entity?: string | null;
	startsAt?: number;
	endsAt?: number | null;
	scheduled?: boolean;
	canceling?: boolean;
	pastDue?: boolean;
	unbilledByStripe?: boolean;
	onLiveSubscription?: boolean;
	externalId?: string | null;
}): TimelineRow => ({
	customerProductId: id,
	planId: testPlan.planId,
	internalEntityId: entity,
	replacementKey: replacementKeyOf(testPlan),
	configHash: `${testPlan.planId}:${hash}`,
	lifetime: testPlan.kind === "oneOff",
	onLiveSubscription:
		onLiveSubscription ??
		(testPlan.kind !== "free" && testPlan.kind !== "oneOff"),
	startsAt,
	endsAt,
	scheduled: scheduled ?? startsAt > NOW,
	canceling,
	pastDue,
	unbilledByStripe,
	externalId,
});

export const desiredSegment = ({
	plan: testPlan,
	hash = "h1",
	entity = null,
	slot = 0,
	startsAt = NOW,
	endsAt = null,
	phaseIndex = 0,
	planIndex = 0,
	ongoing = false,
}: {
	plan: TestPlan;
	hash?: string;
	entity?: string | null;
	slot?: number;
	startsAt?: number;
	endsAt?: number | null;
	phaseIndex?: number;
	planIndex?: number;
	ongoing?: boolean;
}): DesiredSegment => ({
	key: instanceKey({
		planId: testPlan.planId,
		internalEntityId: entity,
		slot,
	}),
	planId: testPlan.planId,
	internalEntityId: entity,
	replacementKey: replacementKeyOf(testPlan),
	configHash: `${testPlan.planId}:${hash}`,
	lifetime: testPlan.kind === "oneOff",
	paidRecurring: testPlan.kind === "main" || testPlan.kind === "addOn",
	startsAt,
	endsAt: testPlan.kind === "oneOff" ? null : endsAt,
	source: ongoing
		? { type: "ongoing", planIndex }
		: { type: "phase", phaseIndex, planIndex },
});

export const desiredTimeline = ({
	segments,
	endsAt = null,
}: {
	segments: DesiredSegment[];
	endsAt?: number | null;
}): DesiredTimeline => ({ segments, endsAt });

export const policiesFor = ({
	undeclared = "end",
	...overrides
}: Partial<SetPlansPolicies> = {}): SetPlansPolicies => ({
	undeclared,
	canceling: "keepCancellation",
	pastDue: "continue",
	liveRows: "carry",
	unbilledRows: "recreate",
	...overrides,
});
