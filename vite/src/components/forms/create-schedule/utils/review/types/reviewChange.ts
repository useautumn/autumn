import type { ReviewChangeLine } from "../planChangeLines";

export type ReviewChangeSystem = "autumn" | "stripe";

/** Stripe-style Product / Qty / Total tables, or the default plan rows. */
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
	/** A billing basis like "Usage-based" rather than a charge. */
	isBasis?: boolean;
};

/** The customer's shared balance a contributor's change feeds. */
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
	/** What changed on an updated row, shown in the status chip's tooltip. */
	changes?: ReviewChangeLine[];
	trialEndsAt?: number;
	/** Kept across every phase, so a later schedule change won't end it. */
	ongoing?: boolean;
	pooled?: ReviewPooledBalance;
	value?: ReviewChangeValue;
	/** Quantity column of a pricing table row. */
	quantity?: string;
	/** The plan's scope: null when customer-level, absent on rows that have no scope. */
	entityId?: string | null;
	/** Rows grouped under this one, e.g. the Stripe items billed for a plan. */
	items?: ReviewChangeRow[];
};

export type ReviewPhaseBadge = "active" | "scheduled" | "canceled";

export type ReviewChangePhase = {
	key: string;
	label: string;
	/** When the phase starts, so removed saved phases sort among the rest. */
	startsAt?: number;
	/** "Sep 30, 2026 – Dec 1, 2026", shown above a pricing table. */
	range?: string;
	badge?: ReviewPhaseBadge;
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
