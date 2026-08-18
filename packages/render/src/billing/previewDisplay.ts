import { formatCount, formatEpochDate, formatMoney } from "../format.js";
import {
	asRecord,
	getArray,
	getNumber,
	getString,
	type LooseRecord,
} from "../records.js";
import { type BillingBadge, billingActionBadges } from "./badges.js";

const UPDATE_INTENT_LABELS: Record<string, string> = {
	cancel_end_of_cycle: "Cancel at end of cycle",
	cancel_immediately: "Cancel immediately",
	uncancel: "Uncancel",
	update_plan: "Update plan",
	update_quantity: "Update quantity",
};

export type BillingChangeDisplay = { name: string; planId: string };

export type LineItemDisplay = {
	amount: number;
	amountText: string;
	name: string;
};

export type SchedulePhaseDisplay = {
	/** Plan ids with custom price when present, e.g. "pro ($120)". */
	plansText: string;
	/** "now", "after <plan>", or a formatted date. */
	timingText: string;
};

export type MoneyDisplay = { amount: number; text: string };

/** The write's plan customizations, dashboard-style: what the custom plan
 * grants/loses relative to the base plan. */
export type CustomizeDisplay = {
	/** "admin — 200 included, then $0.10 each · monthly" */
	addedItems: string[];
	freeTrialText: string | null;
	/** "$200.00 per year" */
	priceText: string | null;
	removedItems: string[];
	/** Full item replacement (customize.items). */
	replacedItems: string[];
	updatedItems: string[];
};

/** Surface-neutral view of a billing action (attach / updateSubscription /
 * createSchedule): what changes, the money facts, and the flipped params.
 * Renderers (React, Block Kit, Ink) decide layout; wording is decided here. */
export type BillingPreviewDisplay = {
	badges: BillingBadge[];
	changes: {
		incoming: BillingChangeDisplay[];
		outgoing: BillingChangeDisplay[];
		/** "Attaching Pro Annual and removing Pro", or null when nothing changes. */
		summaryText: string | null;
	};
	currency: string;
	customerId: string | null;
	dueNow: MoneyDisplay | null;
	entityId: string | null;
	intentLabel: string | null;
	/** Negative total: the customer gets money back, not a charge. */
	isCredit: boolean;
	lineItems: LineItemDisplay[];
	customize: CustomizeDisplay | null;
	prepaid: PrepaidQuantityDisplay[];
	nextCycle: (MoneyDisplay & { startsAtText: string | null }) | null;
	phases: SchedulePhaseDisplay[];
	redirectToCheckout: boolean;
	refund: MoneyDisplay | null;
	subtotal: MoneyDisplay | null;
};

const changeDisplay = (value: unknown): BillingChangeDisplay | null => {
	const change = asRecord(value);
	const planId = getString(change?.plan_id);
	if (!(change && planId)) return null;
	const plan = asRecord(change.plan);
	return { name: getString(plan?.name) ?? planId, planId };
};

const changeSummaryText = ({
	incoming,
	outgoing,
}: {
	incoming: BillingChangeDisplay[];
	outgoing: BillingChangeDisplay[];
}): string | null => {
	// A plan on both sides is an in-place update ("attaching enterprise and
	// removing enterprise" reads as nonsense) — only true switches summarize.
	const incomingIds = new Set(incoming.map((change) => change.planId));
	const outgoingIds = new Set(outgoing.map((change) => change.planId));
	const added = incoming.filter((change) => !outgoingIds.has(change.planId));
	const removed = outgoing.filter((change) => !incomingIds.has(change.planId));
	const names = (changes: BillingChangeDisplay[]) =>
		changes.map((change) => change.name).join(", ");
	if (added.length && removed.length) {
		return `Attaching ${names(added)} and removing ${names(removed)}`;
	}
	if (added.length) return `Attaching ${names(added)}`;
	if (removed.length) return `Removing ${names(removed)}`;
	return null;
};

const LINE_ITEM_NAME_MAX = 58;

const lineItemDisplays = ({
	currency,
	lineItems,
}: {
	currency: string;
	lineItems: unknown[];
}): LineItemDisplay[] =>
	lineItems.flatMap((item) => {
		const record = asRecord(item);
		// The description carries the period ("Pro - Base Price (from 01 Jul…)"),
		// matching the dashboard's line items; zero-amount rows are noise.
		const name =
			getString(record?.description) ?? getString(record?.display_name);
		const amount = getNumber(record?.total);
		if (!record || name === null || amount === null || amount === 0) return [];
		const trimmed =
			name.length > LINE_ITEM_NAME_MAX
				? `${name.slice(0, LINE_ITEM_NAME_MAX)}…`
				: name;
		return [
			{ amount, amountText: formatMoney({ amount, currency }), name: trimmed },
		];
	});

const phaseTimingText = ({
	index,
	phase,
}: {
	index: number;
	phase: LooseRecord;
}): string => {
	const startingAfter = getString(phase.starting_after);
	if (startingAfter) return `after ${startingAfter}`;
	if (phase.starts_at === "now" || (index === 0 && !phase.starts_at)) {
		return "now";
	}
	const startsAt = getNumber(phase.starts_at);
	if (startsAt !== null) return formatEpochDate(startsAt);
	return String(phase.starts_at ?? "");
};

const phasePlansText = (phase: LooseRecord): string =>
	getArray(phase.plans)
		.flatMap((value) => {
			const plan = asRecord(value);
			const planId = getString(plan?.plan_id);
			if (!planId) return [];
			const price = asRecord(asRecord(plan?.customize)?.price);
			const amount = getNumber(price?.amount);
			return [
				amount !== null
					? `${planId} (${formatMoney({ amount, currency: getString(price?.currency) })})`
					: planId,
			];
		})
		.join(", ");

const INTERVAL_ADVERBS: Record<string, string> = {
	day: "daily",
	week: "weekly",
	month: "monthly",
	quarter: "quarterly",
	semi_annual: "semi-annually",
	year: "yearly",
};

const intervalAdverb = (value: unknown): string | null => {
	const interval = getString(value);
	return interval ? (INTERVAL_ADVERBS[interval] ?? interval) : null;
};

const billingMethodLabel = (value: unknown): string | null =>
	value === "prepaid"
		? "prepaid"
		: value === "usage_based"
			? "usage-based"
			: null;

const humanizeFeatureId = (featureId: string) => {
	const text = featureId.replace(/[_-]+/g, " ");
	return text.charAt(0).toUpperCase() + text.slice(1);
};

const featureLabels = (payload: LooseRecord) => {
	const labels = new Map<string, string>();
	for (const side of [payload.incoming, payload.outgoing]) {
		for (const change of getArray(side)) {
			const plan = asRecord(asRecord(change)?.plan);
			for (const value of getArray(plan?.items)) {
				const item = asRecord(value);
				const featureId = getString(item?.feature_id);
				const name = getString(asRecord(item?.feature)?.name);
				if (featureId && name && !labels.has(featureId)) {
					labels.set(featureId, name);
				}
			}
		}
	}
	return labels;
};

const featureLabel = ({
	featureId,
	labels,
}: {
	featureId: string;
	labels: Map<string, string>;
}) => labels.get(featureId) ?? humanizeFeatureId(featureId);

const itemFeatureId = (value: unknown) =>
	getString(asRecord(value)?.feature_id);

const addedItemText = ({
	value,
	labels,
}: {
	value: unknown;
	labels: Map<string, string>;
}): string | null => {
	const item = asRecord(value);
	if (!item) return null;
	const featureId = getString(item.feature_id);
	const feature = featureId ? featureLabel({ featureId, labels }) : "Feature";
	const parts: string[] = [];
	if (item.unlimited === true) {
		parts.push("unlimited");
	} else {
		const price = asRecord(item.price) ?? {};
		const included = getNumber(item.included);
		const amount = getNumber(price.amount);
		const hasTiers = Array.isArray(price.tiers) && price.tiers.length > 0;
		const allowance =
			included !== null ? `${formatCount(included)} included` : null;
		const units = getNumber(price.billing_units);
		const priceLabel =
			amount !== null
				? units && units > 1
					? `${formatMoney({ amount })} per ${formatCount(units)}`
					: `${formatMoney({ amount })} each`
				: hasTiers
					? "tiered pricing"
					: null;
		if (allowance && priceLabel) parts.push(`${allowance}, then ${priceLabel}`);
		else if (allowance ?? priceLabel)
			parts.push((allowance ?? priceLabel) as string);
		const method = billingMethodLabel(price.billing_method);
		if (method) parts.push(method);
		const interval = intervalAdverb(
			price.interval ?? asRecord(item.reset)?.interval,
		);
		if (interval) parts.push(interval);
	}
	const detail = parts.join(" · ");
	return detail ? `${feature} — ${detail}` : feature;
};

const filterText = ({
	value,
	labels,
}: {
	value: unknown;
	labels: Map<string, string>;
}): string | null => {
	const filter = asRecord(value);
	if (!filter) return null;
	const feature = getString(filter.feature_id);
	const qualifiers = [
		billingMethodLabel(filter.billing_method),
		intervalAdverb(filter.interval),
	].filter((part): part is string => Boolean(part));
	if (feature) {
		return qualifiers.length
			? `${featureLabel({ featureId: feature, labels })} · ${qualifiers.join(" · ")}`
			: featureLabel({ featureId: feature, labels });
	}
	return qualifiers.length ? qualifiers.join(" · ") : "matching items";
};

const customPriceText = (value: unknown): string | null => {
	const price = asRecord(value);
	const amount = getNumber(price?.amount);
	if (price === null || amount === null) return null;
	const interval = getString(price.interval);
	const intervalCount = getNumber(price.interval_count);
	const cadence = interval
		? `/${intervalCount && intervalCount > 1 ? `${intervalCount} ${interval}s` : interval}`
		: "";
	return `${formatMoney({ amount, currency: getString(price.currency) })}${cadence}`;
};

const freeTrialText = (value: unknown): string | null => {
	if (value === true) return "free trial";
	const trial = asRecord(value);
	if (!trial) return null;
	const days = getNumber(trial.duration_days ?? trial.days ?? trial.length);
	return days !== null ? `${formatCount(days)}-day free trial` : "free trial";
};

const customizeDisplay = ({
	params,
	payload,
}: {
	params?: Record<string, unknown> | null;
	payload: LooseRecord;
}): CustomizeDisplay | null => {
	const customize = asRecord(params?.customize);
	if (!customize) return null;
	const labels = featureLabels(payload);
	const collect = (value: unknown, render: (entry: unknown) => string | null) =>
		getArray(value).flatMap((entry) => render(entry) ?? []);
	const added = getArray(customize.add_items);
	const removed = getArray(customize.remove_items);
	const counts = (items: unknown[]) => {
		const result = new Map<string, number>();
		for (const item of items) {
			const featureId = itemFeatureId(item);
			if (featureId) result.set(featureId, (result.get(featureId) ?? 0) + 1);
		}
		return result;
	};
	const addCounts = counts(added);
	const removeCounts = counts(removed);
	const updatedFeatureIds = new Set(
		[...addCounts].flatMap(([featureId, count]) =>
			count === 1 && removeCounts.get(featureId) === 1 ? featureId : [],
		),
	);
	const display: CustomizeDisplay = {
		addedItems: collect(
			added.filter((item) => !updatedFeatureIds.has(itemFeatureId(item) ?? "")),
			(item) => addedItemText({ value: item, labels }),
		),
		freeTrialText: freeTrialText(customize.free_trial),
		priceText: customPriceText(customize.price),
		removedItems: collect(
			removed.filter(
				(item) => !updatedFeatureIds.has(itemFeatureId(item) ?? ""),
			),
			(item) => filterText({ value: item, labels }),
		),
		replacedItems: collect(customize.items, (item) =>
			addedItemText({ value: item, labels }),
		),
		updatedItems: [
			...collect(customize.update_items, (entry) => {
				const record = asRecord(entry);
				return filterText({ value: record?.filter ?? entry, labels });
			}),
			...collect(
				added.filter((item) =>
					updatedFeatureIds.has(itemFeatureId(item) ?? ""),
				),
				(item) => addedItemText({ value: item, labels }),
			),
		],
	};
	const hasContent =
		display.addedItems.length > 0 ||
		display.removedItems.length > 0 ||
		display.replacedItems.length > 0 ||
		display.updatedItems.length > 0 ||
		display.priceText !== null ||
		display.freeTrialText !== null;
	return hasContent ? display : null;
};

/** A prepaid item on the incoming plan and the quantity the write sets for
 * it. `quantity: null` means the write omits it — the API defaults it to 0,
 * which approvers must see. */
export type PrepaidQuantityDisplay = {
	featureId: string;
	featureName: string;
	includedDefault: number | null;
	quantity: number | null;
};

const prepaidQuantityDisplays = ({
	params,
	payload,
}: {
	params?: Record<string, unknown> | null;
	payload: LooseRecord;
}): PrepaidQuantityDisplay[] => {
	const labels = featureLabels(payload);
	const quantities = new Map(
		getArray(params?.feature_quantities).flatMap((entry) => {
			const record = asRecord(entry);
			const featureId = getString(record?.feature_id);
			const quantity = getNumber(record?.quantity);
			return featureId && quantity !== null
				? [[featureId, quantity] as const]
				: [];
		}),
	);
	const displays: PrepaidQuantityDisplay[] = [];
	const seen = new Set<string>();
	for (const change of getArray(payload.incoming)) {
		const plan = asRecord(asRecord(change)?.plan);
		for (const item of getArray(plan?.items)) {
			const record = asRecord(item);
			const featureId = getString(record?.feature_id);
			const billingMethod = asRecord(record?.price)?.billing_method;
			if (!featureId || billingMethod !== "prepaid" || seen.has(featureId)) {
				continue;
			}
			seen.add(featureId);
			displays.push({
				featureId,
				featureName: featureLabel({ featureId, labels }),
				includedDefault: getNumber(record?.included),
				quantity: quantities.get(featureId) ?? null,
			});
		}
	}
	// The preview only carries plan items when expanded — quantities the write
	// sets explicitly must still show.
	for (const [featureId, quantity] of quantities) {
		if (seen.has(featureId)) continue;
		displays.push({
			featureId,
			featureName: featureLabel({ featureId, labels }),
			includedDefault: null,
			quantity,
		});
	}
	return displays;
};

const money = ({
	amount,
	currency,
}: {
	amount: number | null;
	currency: string;
}): MoneyDisplay | null =>
	amount === null ? null : { amount, text: formatMoney({ amount, currency }) };

/** Accepts a typed BillingPreviewResponse or a loose record straight from
 * `parsePreviewPayload` — reads defensively either way. */
export const buildBillingPreviewDisplay = ({
	params,
	preview,
}: {
	params?: Record<string, unknown> | null;
	preview?: Record<string, unknown> | null;
}): BillingPreviewDisplay => {
	const payload = preview ?? {};
	const currency = getString(payload.currency) ?? "usd";
	const incoming = getArray(payload.incoming).flatMap(
		(change) => changeDisplay(change) ?? [],
	);
	const outgoing = getArray(payload.outgoing).flatMap(
		(change) => changeDisplay(change) ?? [],
	);
	const total = getNumber(payload.total);
	const nextCycle = asRecord(payload.next_cycle);
	const nextCycleTotal = getNumber(nextCycle?.total);
	const nextCycleStartsAt = getNumber(nextCycle?.starts_at);
	const refundAmount = getNumber(asRecord(payload.refund)?.amount);
	const intent = getString(payload.intent);
	const phases = getArray(params?.phases).flatMap((value, index) => {
		const phase = asRecord(value);
		if (!phase) return [];
		return [
			{
				plansText: phasePlansText(phase),
				timingText: phaseTimingText({ index, phase }),
			},
		];
	});

	return {
		// Chat cards show only params the write actually set — an unset toggle
		// on a cancel is noise (the dashboard's form shows all toggles instead).
		badges: billingActionBadges(params, { explicitOnly: true }),
		changes: {
			incoming,
			outgoing,
			summaryText: changeSummaryText({ incoming, outgoing }),
		},
		currency,
		customerId:
			getString(params?.customer_id) ?? getString(payload.customer_id),
		customize: customizeDisplay({ params, payload }),
		dueNow: money({ amount: total, currency }),
		entityId: getString(params?.entity_id),
		intentLabel: intent ? (UPDATE_INTENT_LABELS[intent] ?? null) : null,
		isCredit: total !== null && total < 0,
		lineItems: lineItemDisplays({
			currency,
			lineItems: getArray(payload.line_items),
		}),
		nextCycle:
			nextCycleTotal === null
				? null
				: {
						amount: nextCycleTotal,
						startsAtText:
							nextCycleStartsAt === null
								? null
								: formatEpochDate(nextCycleStartsAt),
						text: formatMoney({ amount: nextCycleTotal, currency }),
					},
		phases,
		prepaid: prepaidQuantityDisplays({ params, payload }),
		redirectToCheckout: payload.redirect_to_checkout === true,
		refund: money({ amount: refundAmount, currency }),
		subtotal: money({ amount: getNumber(payload.subtotal), currency }),
	};
};
