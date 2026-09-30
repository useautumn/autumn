import type { ReviewChangeLine } from "../planChangeLines";

export type ReviewChangeSystem = "autumn" | "stripe";

export type ReviewChangeStatus =
	| "starts"
	| "ends"
	| "kept"
	| "updated"
	| "added"
	| "removed"
	| "reset"
	| "carried"
	| "unmanaged";

export type ReviewChangeValue = {
	amount: string;
	suffix?: string;
};

export type ReviewChangeRow = {
	key: string;
	title: string;
	description?: string;
	status?: ReviewChangeStatus;
	/** What changed on an updated row, shown in the status chip's tooltip. */
	changes?: ReviewChangeLine[];
	trialEndsAt?: number;
	value?: ReviewChangeValue;
};

export type ReviewChangePhase = {
	key: string;
	label: string;
	/** A saved future phase the edited schedule drops. */
	removed?: boolean;
	rows: ReviewChangeRow[];
};

export type ReviewStripeId = {
	key: string;
	label: string;
	id: string;
};

export type ReviewChangeSection = {
	phases: ReviewChangePhase[];
	summary: string;
	stripeIds?: ReviewStripeId[];
};
