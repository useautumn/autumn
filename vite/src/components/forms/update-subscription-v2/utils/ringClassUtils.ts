export type RowState =
	| "default"
	| "created"
	| "modified"
	| "removed"
	| "version";

export function getRowRingClass(state: RowState): string {
	switch (state) {
		case "created":
			return "ring-1 ring-inset ring-green-500/50";
		case "modified":
			return "ring-1 ring-inset ring-amber-500/50";
		case "removed":
			return "ring-1 ring-inset ring-red-500/50";
		case "version":
			return "ring-1 ring-inset ring-purple-500/50";
		default:
			return "";
	}
}

export function getTrialRingClass({
	removeTrial,
	isTrialModified,
	hasTrialValue,
	isCurrentlyTrialing,
}: {
	removeTrial: boolean;
	isTrialModified: boolean;
	hasTrialValue: boolean;
	isCurrentlyTrialing: boolean;
}): string {
	if (removeTrial) return getRowRingClass("removed");
	if (isTrialModified) return getRowRingClass("modified");
	if (hasTrialValue && !isCurrentlyTrialing) return getRowRingClass("created");
	return "";
}

export function getItemRingClass({
	isDeleted,
	isCreated,
	hasEdits,
}: {
	isDeleted: boolean;
	isCreated: boolean;
	hasEdits: boolean;
}): string {
	if (isDeleted) return `${getRowRingClass("removed")} opacity-60`;
	if (isCreated) return getRowRingClass("created");
	if (hasEdits) return getRowRingClass("modified");
	return "";
}
