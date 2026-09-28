import type { ProductV2 } from "@autumn/shared";

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
	value?: ReviewChangeValue;
};

export type ReviewChangePhase = {
	key: string;
	label: string;
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

/** A plan the form declares or the customer already has, priced with its own items. */
export type ReviewPlan = {
	planId: string;
	entityId: string | null;
	product: ProductV2 | undefined;
};
