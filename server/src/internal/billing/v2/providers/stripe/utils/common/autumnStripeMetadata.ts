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

export const isAutumnManagedStripeSchedule = ({
	schedule,
}: {
	schedule: Stripe.SubscriptionSchedule | null | undefined;
}): boolean =>
	Boolean(schedule?.metadata?.[AUTUMN_STRIPE_METADATA_KEYS.managedAt]);

export const isAutumnManagedSubscriptionMetadata = ({
	metadata,
	windowMs = RECENT_AUTUMN_ACTION_WINDOW_MS,
	now = Date.now(),
	requireRecent = true,
	ignoreManagedSource = false,
}: {
	metadata: Stripe.Metadata | null | undefined;
	windowMs?: number;
	now?: number;
	requireRecent?: boolean;
	ignoreManagedSource?: boolean;
}): { skip: boolean; reason?: string } => {
	if (!metadata) return { skip: false };

	const source = metadata[AUTUMN_STRIPE_METADATA_KEYS.managedSource];
	if (source && !ignoreManagedSource) {
		return {
			skip: true,
			reason: `autumn_managed_source=${source}`,
		};
	}

	const managedAtRaw = metadata[AUTUMN_STRIPE_METADATA_KEYS.managedAt];
	if (!managedAtRaw) return { skip: false };

	const managedAt = Number(managedAtRaw);
	if (!Number.isFinite(managedAt)) return { skip: false };

	if (!requireRecent) {
		return { skip: true, reason: `autumn_managed_at present (source=unknown)` };
	}

	if (now - managedAt >= windowMs) return { skip: false };

	return {
		skip: true,
		reason: `recent autumn_managed_at (${now - managedAt}ms ago, source=unknown)`,
	};
};
