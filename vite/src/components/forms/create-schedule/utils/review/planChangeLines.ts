import {
	type ApiPlanItemV1,
	type CustomerPlanChange,
	type Feature,
	numberWithCommas,
	type PlanItemChangeV0,
	type PlanPriceChangeV0,
} from "@autumn/shared";
import {
	intervalSuffix,
	isAbbreviatedInterval,
} from "@/utils/formatUtils/intervalSuffix";
import { formatPhaseDate } from "../schedulePhaseTiming";
import { formatMoney } from "./formatMoney";

/** One change on an updated plan: what changed, and its value before and after. */
export type ReviewChangeLineState = "new" | "updated" | "removed";

export type ReviewChangeLine = {
	state: ReviewChangeLineState;
	label: string;
	before?: string;
	after?: string;
};

type PriceValue = { amount: string; suffix?: string };

const formatDate = (ms: number) => formatPhaseDate({ startsAt: ms });

const suffixFor = ({
	interval,
	intervalCount,
}: {
	interval?: string | null;
	intervalCount?: number;
}) =>
	interval && isAbbreviatedInterval(interval)
		? ` ${intervalSuffix({ interval, intervalCount })}`
		: "";

/** The old value drops a suffix the new value repeats, so "$2,000 → $2,500 /mo" reads once. */
const changeLine = ({
	label,
	before,
	after,
}: {
	label: string;
	before: PriceValue;
	after: PriceValue;
}): ReviewChangeLine => ({
	state: "updated",
	label,
	before:
		before.suffix === after.suffix
			? before.amount
			: `${before.amount}${before.suffix ?? ""}`,
	after: `${after.amount}${after.suffix ?? ""}`,
});

const lifecycleLines = (change: CustomerPlanChange): ReviewChangeLine[] => {
	const previous = change.previous_attributes;
	if (!previous) return [];
	const subscription = change.subscription;
	const lines: ReviewChangeLine[] = [];

	if ("expires_at" in previous) {
		const expiresAt =
			subscription?.expires_at ?? change.purchase?.expires_at ?? null;
		lines.push({
			state: "updated",
			label: "Ends",
			...(previous.expires_at && { before: formatDate(previous.expires_at) }),
			after: expiresAt === null ? "Never" : formatDate(expiresAt),
		});
	}
	if ("trial_ends_at" in previous) {
		const trialEndsAt = subscription?.trial_ends_at ?? null;
		lines.push({
			state: "updated",
			label: "Trial ends",
			...(previous.trial_ends_at && {
				before: formatDate(previous.trial_ends_at),
			}),
			after: trialEndsAt === null ? "Ended" : formatDate(trialEndsAt),
		});
	}
	if ("canceled_at" in previous) {
		lines.push({
			state: "updated",
			label: "Cancellation",
			after: subscription?.canceled_at ? "Canceled" : "Removed",
		});
	}
	if (previous.past_due && !subscription?.past_due) {
		lines.push({ state: "updated", label: "Past due", after: "Resolved" });
	}
	return lines;
};

const planPriceValue = ({
	price,
	currency,
}: {
	price: NonNullable<PlanPriceChangeV0["current"]>;
	currency: string;
}): PriceValue => ({
	amount: formatMoney({ amount: price.amount, currency }),
	suffix: suffixFor({
		interval: price.interval,
		intervalCount: price.interval_count,
	}),
});

const priceLines = ({
	priceChange,
	currency,
}: {
	priceChange?: PlanPriceChangeV0;
	currency: string;
}): ReviewChangeLine[] => {
	if (!priceChange?.current) return [];
	const after = planPriceValue({ price: priceChange.current, currency });
	if (!priceChange.previous) {
		return [{ state: "new", label: "Price", after: after.amount }];
	}
	return [
		changeLine({
			label: "Price",
			before: planPriceValue({ price: priceChange.previous, currency }),
			after,
		}),
	];
};

const includedValue = (items: ApiPlanItemV1[]): PriceValue | undefined => {
	const included = items.reduce((sum, item) => sum + (item.included ?? 0), 0);
	if (included <= 0) return undefined;
	return {
		amount: numberWithCommas(included),
		suffix: suffixFor({ interval: items[0]?.reset?.interval }),
	};
};

const unitPriceValue = ({
	items,
	currency,
}: {
	items: ApiPlanItemV1[];
	currency: string;
}): PriceValue | undefined => {
	const price = items.find((item) => item.price?.amount !== undefined)?.price;
	if (price?.amount === undefined) return undefined;
	const billingUnits = price.billing_units ?? 1;
	return {
		amount: formatMoney({ amount: price.amount, currency, showCents: true }),
		suffix:
			billingUnits > 1 ? ` /${numberWithCommas(billingUnits)} units` : " /unit",
	};
};

const sameValue = (first?: PriceValue, second?: PriceValue) =>
	first?.amount === second?.amount && first?.suffix === second?.suffix;

/** The included amount when it changed, else the per-unit price, else nothing worth showing. */
const itemValues = ({
	before,
	after,
	currency,
}: {
	before: ApiPlanItemV1[];
	after: ApiPlanItemV1[];
	currency: string;
}) => {
	const includedBefore = includedValue(before);
	const includedAfter = includedValue(after);
	if (!sameValue(includedBefore, includedAfter)) {
		return {
			before: includedBefore ?? { amount: "0" },
			after: includedAfter ?? { amount: "0" },
		};
	}
	const priceBefore = unitPriceValue({ items: before, currency });
	const priceAfter = unitPriceValue({ items: after, currency });
	if (!sameValue(priceBefore, priceAfter)) {
		return {
			before: priceBefore ?? { amount: "None" },
			after: priceAfter ?? { amount: "None" },
		};
	}
	return undefined;
};

const featureIdsInOrder = (itemChanges: PlanItemChangeV0[]) => [
	...new Set(itemChanges.map((itemChange) => itemChange.feature_id)),
];

const itemsFor = ({
	itemChanges,
	featureId,
	action,
}: {
	itemChanges: PlanItemChangeV0[];
	featureId: string;
	action: PlanItemChangeV0["action"];
}) =>
	itemChanges
		.filter(
			(itemChange) =>
				itemChange.feature_id === featureId && itemChange.action === action,
		)
		.map((itemChange) => itemChange.item);

/** Items are snapshots: a feature removed and re-added in one change is one edit, not two. */
const itemLines = ({
	itemChanges,
	features,
	currency,
}: {
	itemChanges: PlanItemChangeV0[];
	features: Feature[];
	currency: string;
}): ReviewChangeLine[] =>
	featureIdsInOrder(itemChanges).flatMap((featureId): ReviewChangeLine[] => {
		const label =
			features.find((feature) => feature.id === featureId)?.name ?? featureId;
		const removed = itemsFor({ itemChanges, featureId, action: "deleted" });
		const added = itemsFor({ itemChanges, featureId, action: "created" });

		if (removed.length === 0) return [{ state: "new", label, after: "Added" }];
		if (added.length === 0) {
			return [{ state: "removed", label, after: "Removed" }];
		}

		const values = itemValues({ before: removed, after: added, currency });
		return values ? [changeLine({ label, ...values })] : [];
	});

/** What changed on an updated plan, read from the preview's plan_changes. */
export const planChangeLines = ({
	change,
	features,
	currency,
}: {
	change: CustomerPlanChange;
	features: Feature[];
	currency: string;
}): ReviewChangeLine[] => [
	...lifecycleLines(change),
	...priceLines({
		priceChange: change.plan_change?.price_change,
		currency,
	}),
	...itemLines({
		itemChanges: change.plan_change?.item_changes ?? [],
		features,
		currency,
	}),
];

export const findPlanChange = ({
	planChanges,
	planId,
	entityId,
}: {
	planChanges: CustomerPlanChange[];
	planId: string;
	entityId: string | null;
}) =>
	planChanges.find(
		(change) =>
			(change.subscription?.plan_id ?? change.purchase?.plan_id) === planId &&
			(change.entity_id ?? null) === entityId,
	);
