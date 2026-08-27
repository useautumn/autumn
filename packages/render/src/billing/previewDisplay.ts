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

type PlanItemChangeDisplay = {
	change: "Add" | "Remove" | "Replace" | "Update";
	featureId: string | null;
	includedText: string | null;
	pricingText: string | null;
};

/** The write's plan customizations, dashboard-style: what the custom plan
 * grants/loses relative to the base plan. */

/** Surface-neutral billing action facts shared by every renderer. */
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
	prepaid: PrepaidQuantityDisplay[];
	nextCycle: (MoneyDisplay & { startsAtText: string | null }) | null;
	resetsUsage: boolean;
	phases: SchedulePhaseDisplay[];
	redirectToCheckout: boolean;
	refund: MoneyDisplay | null;
	subtotal: MoneyDisplay | null;
};

const changeDisplay = ({
	planNames,
	value,
}: {
	planNames: ReadonlyMap<string, string>;
	value: unknown;
}): BillingChangeDisplay | null => {
	const change = asRecord(value);
	const planId = getString(change?.plan_id);
	if (!(change && planId)) return null;
	const plan = asRecord(change.plan);
	return {
		name: getString(plan?.name) ?? planNames.get(planId) ?? planId,
		planId,
	};
};

/** A plan on both sides is an in-place update, not a removal — only plans
 * that truly leave the customer count. */
export const removedPlanChanges = ({
	incoming,
	outgoing,
}: {
	incoming: BillingChangeDisplay[];
	outgoing: BillingChangeDisplay[];
}): BillingChangeDisplay[] => {
	const incomingIds = new Set(incoming.map((change) => change.planId));
	return outgoing.filter((change) => !incomingIds.has(change.planId));
};

const changeSummaryText = ({
	incoming,
	outgoing,
}: {
	incoming: BillingChangeDisplay[];
	outgoing: BillingChangeDisplay[];
}): string | null => {
	const outgoingIds = new Set(outgoing.map((change) => change.planId));
	const added = incoming.filter((change) => !outgoingIds.has(change.planId));
	const removed = removedPlanChanges({ incoming, outgoing });
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

export const phaseTimingText = ({
	index,
	phase,
}: {
	index: number;
	phase: LooseRecord;
}): string => {
	const startingAfter = asRecord(phase.starting_after);
	const durationCount = getNumber(startingAfter?.duration_count);
	const durationType = getString(startingAfter?.duration_type);
	if (durationCount !== null && durationType) {
		return `after ${formatCount(durationCount)} ${durationType}${durationCount === 1 ? "" : "s"}`;
	}
	if (phase.starts_at === "now" || (index === 0 && !phase.starts_at)) {
		return "now";
	}
	const startsAt = getNumber(phase.starts_at);
	if (startsAt !== null) return formatEpochDate(startsAt);
	return String(phase.starts_at ?? "");
};

const phasePlansText = ({
	phase,
	planNames,
}: {
	phase: LooseRecord;
	planNames: ReadonlyMap<string, string>;
}): string =>
	getArray(phase.plans)
		.flatMap((value) => {
			const plan = asRecord(value);
			const planId = getString(plan?.plan_id);
			if (!planId) return [];
			const price = asRecord(asRecord(plan?.customize)?.price);
			const amount = getNumber(price?.amount);
			return [
				amount !== null
					? `${planNames.get(planId) ?? planId} (${formatMoney({ amount, currency: getString(price?.currency) })})`
					: (planNames.get(planId) ?? planId),
			];
		})
		.join(", ");

const itemPricingText = (value: unknown): string | null => {
	const price = asRecord(value);
	if (!price) return null;
	const currency = getString(price.currency);
	const units = getNumber(price.billing_units) ?? 1;
	const unitText = units > 1 ? formatCount(units) : "unit";
	const amount = getNumber(price.amount);
	if (amount !== null) {
		return `${formatMoney({ amount, currency })} / ${unitText}`;
	}

	const tiers = getArray(price.tiers).flatMap((value) => {
		const tier = asRecord(value);
		const tierAmount = getNumber(tier?.amount);
		const flatAmount = getNumber(tier?.flat_amount);
		if (tierAmount === null && flatAmount === null) return [];
		const priceText = [
			tierAmount !== null
				? `${formatMoney({ amount: tierAmount, currency })} / ${unitText}`
				: null,
			flatAmount !== null
				? `${formatMoney({ amount: flatAmount, currency })} flat`
				: null,
		]
			.filter((part): part is string => Boolean(part))
			.join(" + ");
		const to = getNumber(tier?.to);
		return [to === null ? priceText : `≤${formatCount(to)}: ${priceText}`];
	});
	if (!tiers.length) return null;
	const behavior = getString(price.tier_behavior);
	return `${tiers.join("; ")}${behavior ? ` · ${behavior} tiers` : ""}`;
};

export const buildPlanItemChangeDisplay = ({
	change,
	item: value,
}: {
	change: PlanItemChangeDisplay["change"];
	item: unknown;
}): PlanItemChangeDisplay | null => {
	const item = asRecord(value);
	if (!item) return null;
	const price = asRecord(item.price);
	const included = getNumber(item.included);
	return {
		change,
		featureId: getString(item.feature_id),
		includedText:
			item.unlimited === true
				? "Unlimited"
				: included === null || included === 0
					? null
					: formatCount(included),
		pricingText: itemPricingText(price),
	};
};

export type PrepaidQuantityDisplay = {
	featureId: string;
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
				includedDefault: getNumber(record?.included),
				quantity: quantities.get(featureId) ?? null,
			});
		}
	}
	// The preview only carries plan items when expanded — quantities the write
	// sets explicitly must still show.
	for (const [featureId, quantity] of quantities) {
		if (seen.has(featureId)) continue;
		displays.push({ featureId, includedDefault: null, quantity });
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

/** Accepts typed previews or loose output from `parsePreviewPayload`. */
export const buildBillingPreviewDisplay = ({
	params,
	planNames: knownPlanNames,
	preview,
}: {
	params?: Record<string, unknown> | null;
	planNames?: Readonly<Record<string, string>>;
	preview?: Record<string, unknown> | null;
}): BillingPreviewDisplay => {
	const payload = preview ?? {};
	const currency = getString(payload.currency) ?? "usd";
	const planNames = new Map(Object.entries(knownPlanNames ?? {}));
	// Schedule previews repeat a plan once per phase; the change list is
	// about which plans change, so each plan renders once.
	const uniqueByPlanId = (changes: BillingChangeDisplay[]) => {
		const seen = new Set<string>();
		return changes.filter(({ planId }) => {
			if (seen.has(planId)) return false;
			seen.add(planId);
			return true;
		});
	};
	const incoming = uniqueByPlanId(
		getArray(payload.incoming).flatMap(
			(value) => changeDisplay({ planNames, value }) ?? [],
		),
	);
	const outgoing = uniqueByPlanId(
		getArray(payload.outgoing).flatMap(
			(value) => changeDisplay({ planNames, value }) ?? [],
		),
	);
	for (const { name, planId } of [...incoming, ...outgoing]) {
		planNames.set(planId, name);
	}
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
				plansText: phasePlansText({ phase, planNames }),
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
		dueNow: money({ amount: total, currency }),
		entityId: getString(params?.entity_id),
		intentLabel: intent ? (UPDATE_INTENT_LABELS[intent] ?? null) : null,
		isCredit: total !== null && total < 0,
		lineItems: lineItemDisplays({
			currency,
			lineItems: getArray(payload.line_items),
		}),
		resetsUsage: payload.resets_usage === true,
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
