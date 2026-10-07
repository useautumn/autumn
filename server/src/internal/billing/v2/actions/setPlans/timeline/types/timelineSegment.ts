/** One plan instance: the same plan in the same scope, told apart from duplicates by its slot. */
export type InstanceIdentity = {
	key: string;
	planId: string;
	internalEntityId: string | null;
	/** Plans sharing a replacement key and scope cannot run side by side. */
	replacementKey: string;
};

/** A customer product row backing part of a saved segment. */
export type SavedRow = {
	customerProductId: string;
	startsAt: number;
	endsAt: number | null;
	/** A reset-now moves a period-end cancellation here. */
	periodEndsAtAfterReset: number | null;
	scheduled: boolean;
	canceling: boolean;
	pastDue: boolean;
	unbilledByStripe: boolean;
};

/** A run of contiguous rows granting one instance the same config. */
export type SavedSegment = InstanceIdentity & {
	configHash: string;
	/** One-off purchases are never ended by leaving them out of a request. */
	lifetime: boolean;
	onLiveSubscription: boolean;
	startsAt: number;
	endsAt: number | null;
	rows: SavedRow[];
};

export type DesiredSegmentSource =
	| { type: "phase"; phaseIndex: number; planIndex: number }
	| { type: "ongoing"; planIndex: number };

/** What the request asks one instance to be over one interval. */
export type DesiredSegment = InstanceIdentity & {
	configHash: string;
	lifetime: boolean;
	paidRecurring: boolean;
	startsAt: number;
	endsAt: number | null;
	source: DesiredSegmentSource;
	/** Later phases that listed this instance unchanged and were folded into it. */
	mergedSources?: DesiredSegmentSource[];
};
