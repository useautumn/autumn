import { ms } from "@autumn/shared";
import type Stripe from "stripe";

export const AUTUMN_STRIPE_METADATA_KEYS = {
	managedAt: "autumn_managed_at",
	managedSource: "autumn_managed_source",
} as const;

export const RECENT_AUTUMN_ACTION_WINDOW_MS = ms.minutes(10);

export const buildAutumnSubscriptionMetadata = ({
	actionSource,
	now = Date.now(),
}: {
	actionSource?: string;
	now?: number;
}): Stripe.MetadataParam => {
	const meta: Stripe.MetadataParam = {
		[AUTUMN_STRIPE_METADATA_KEYS.managedAt]: String(now),
	};

	if (actionSource) {
		meta[AUTUMN_STRIPE_METADATA_KEYS.managedSource] = actionSource;
	}

	return meta;
};

export const isAutumnManagedSubscriptionMetadata = ({
	metadata,
	windowMs = RECENT_AUTUMN_ACTION_WINDOW_MS,
	now = Date.now(),
}: {
	metadata: Stripe.Metadata | null | undefined;
	windowMs?: number;
	now?: number;
}): { skip: boolean; reason?: string } => {
	if (!metadata) return { skip: false };

	const managedAtRaw = metadata[AUTUMN_STRIPE_METADATA_KEYS.managedAt];
	if (!managedAtRaw) return { skip: false };

	const managedAt = Number(managedAtRaw);
	if (!Number.isFinite(managedAt) || now - managedAt >= windowMs) {
		return { skip: false };
	}

	const source =
		metadata[AUTUMN_STRIPE_METADATA_KEYS.managedSource] ?? "unknown";
	return {
		skip: true,
		reason: `recent autumn_managed_at (${now - managedAt}ms ago, source=${source})`,
	};
};
