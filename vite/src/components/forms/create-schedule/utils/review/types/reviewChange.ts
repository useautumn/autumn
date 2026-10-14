import type { ReviewChangeLine } from "../planChangeLines";

export type ReviewChangeSystem = "autumn" | "stripe";

export type ReviewChangeLayout = "plan_rows" | "pricing_table";

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
	isBasis?: boolean;
};

export type ReviewPooledBalance = {
	featureName: string;
	previousTotal: number | null;
	total: number;
	contributors: number;
};

export type ReviewChangeRow = {
	key: string;
	title: string;
	description?: string;
	status?: ReviewChangeStatus;
	changes?: ReviewChangeLine[];
	trialEndsAt?: number;
	ongoing?: boolean;
	pooled?: ReviewPooledBalance;
	value?: ReviewChangeValue;
	quantity?: string;
	entityId?: string | null;
	items?: ReviewChangeRow[];
};

export type ReviewPhaseBadge = "active" | "scheduled" | "canceled";

export type ReviewChangePhase = {
	key: string;
	label: string;
	startsAt?: number;
	range?: string;
	badge?: ReviewPhaseBadge;
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
