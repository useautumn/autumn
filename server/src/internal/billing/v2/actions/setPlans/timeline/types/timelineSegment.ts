export type InstanceIdentity = {
	key: string;
	planId: string;
	internalEntityId: string | null;
	replacementKey: string;
};

export type SavedRow = {
	customerProductId: string;
	startsAt: number;
	endsAt: number | null;
	periodEndsAtAfterReset: number | null;
	scheduled: boolean;
	canceling: boolean;
	pastDue: boolean;
	unbilledByStripe: boolean;
};

export type SavedSegment = InstanceIdentity & {
	configHash: string;
	lifetime: boolean;
	onLiveSubscription: boolean;
	startsAt: number;
	endsAt: number | null;
	rows: SavedRow[];
};

export type DesiredSegmentSource =
	| { type: "phase"; phaseIndex: number; planIndex: number }
	| { type: "ongoing"; planIndex: number };

export type DesiredSegment = InstanceIdentity & {
	configHash: string;
	lifetime: boolean;
	paidRecurring: boolean;
	startsAt: number;
	endsAt: number | null;
	source: DesiredSegmentSource;
	mergedSources?: DesiredSegmentSource[];
};
