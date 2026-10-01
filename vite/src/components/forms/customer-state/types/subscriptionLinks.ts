import type { StatusGlyph, StatusTone } from "@autumn/ui";

export type SubscriptionSummary = {
	/** e.g. "Monthly · renews Nov 1, 2026"; null until Stripe has loaded. */
	details: string | null;
	status: { label: string; tone: StatusTone; glyph: StatusGlyph } | null;
};

/** How the form describes and opens the customer's other subscriptions. */
export type SubscriptionLinks = {
	describe: (stripeSubscriptionId: string) => SubscriptionSummary | null;
	open: (stripeSubscriptionId: string) => void;
	/** Back to the picker to choose a different subscription. */
	pick: () => void;
};
