import type { StatusGlyph, StatusTone } from "@autumn/ui";

export type SubscriptionSummary = {
	details: string | null;
	status: { label: string; tone: StatusTone; glyph: StatusGlyph } | null;
};

export type SubscriptionLinks = {
	describe: (stripeSubscriptionId: string) => SubscriptionSummary | null;
	open: (stripeSubscriptionId: string) => void;
	pick: () => void;
};
