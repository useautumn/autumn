import type { StatusGlyph, StatusTone } from "@autumn/ui";
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
	/** A billing basis like "Usage-based" rather than a charge. */
	isBasis?: boolean;
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
	/** The plan's scope: null when customer-level, absent on rows that have no scope. */
	entityId?: string | null;
	/** Type icon shown before the title, e.g. a Stripe item's feature type. */
	icon?: { tone: StatusTone; glyph: StatusGlyph };
	/** Rows grouped under this one, e.g. the Stripe items billed for a plan. */
	items?: ReviewChangeRow[];
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
