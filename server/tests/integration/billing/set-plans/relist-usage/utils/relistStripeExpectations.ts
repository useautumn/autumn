import { expect } from "bun:test";
import { addMonths } from "date-fns";
import type { RelistRun } from "./relistMatrix";
import {
	RELIST,
	type RelistAnchor,
	type RelistBilling,
	type RelistChange,
	type RelistDate,
	type RelistProration,
	relistBilling,
} from "./relistTypes";

/**
 * Stripe's behaviour for each re-list, from plain-Stripe test clocks (handoffs/ATMN-746/stripe-relist-wide.md,
 * stripe-relist-no-sub.md). prorate_immediately maps to always_invoice. bill_difference has no Stripe
 * equivalent: per decision D8 it credits only the unused old period and charges the new item in full.
 */

type LicensedItem = { key: string; amount: number };

const PRO = { key: "pro", amount: RELIST.proPrice };
const PRO_30 = { key: "pro30", amount: RELIST.changedProPrice };
const WORDS_1 = { key: "words×1", amount: RELIST.wordsPackPrice };
const WORDS_2 = { key: "words×2", amount: RELIST.wordsPackPrice * 2 };
const PREMIUM = { key: "premium", amount: RELIST.premiumPrice };
const ADD_ON = { key: "addon", amount: RELIST.addOnPrice };

const BEFORE: LicensedItem[] = [PRO, WORDS_1];

/** The licensed items after each change, and whether Pro's metered price survives it. */
const AFTER: Record<
	RelistChange,
	{ items: LicensedItem[]; meteredKept: boolean }
> = {
	unchanged: { items: [PRO, WORDS_1], meteredKept: true },
	base_price: { items: [PRO_30, WORDS_1], meteredKept: true },
	usage_price: { items: [PRO, WORDS_1], meteredKept: false },
	prepaid_quantity: { items: [PRO, WORDS_2], meteredKept: true },
	swap: { items: [PREMIUM], meteredKept: false },
	drop: { items: [ADD_ON], meteredKept: false },
	add: { items: [PRO, WORDS_1, ADD_ON], meteredKept: true },
};

const OVERAGE =
	Math.round(
		(RELIST.tracked - RELIST.includedMessages) * RELIST.unitPrice * 100,
	) / 100;

const cents = (amount: number) => Math.round(amount * 100);
const dollars = (amountCents: number) => amountCents / 100;
const prorate = (amount: number, ratio: number) =>
	Math.round(cents(amount) * ratio);
const sumCents = (items: LicensedItem[], ratio = 1) =>
	items.reduce((total, item) => total + prorate(item.amount, ratio), 0);

const has = (items: LicensedItem[], item: LicensedItem) =>
	items.some(({ key }) => key === item.key);

const ratioBetween = ({
	from,
	to,
	over,
}: {
	from: number;
	to: number;
	over: [number, number];
}) => (to - from) / (over[1] - over[0]);

type StripeTimeline = {
	executeCents: number;
	executeUsage: boolean;
	anchorCents: number;
	anchorUsage: boolean;
	renewalCents: number;
	renewalUsage: boolean;
	usageAfterChange: number;
	periodEnd: RelistDate;
	/** The next licensed charge: Autumn's next_cycle never includes usage. */
	nextCycle: { startsAt: RelistDate; cents: number } | null;
};

const liveTimeline = ({
	change,
	anchor,
	proration,
	cancelsAtRenewal,
	periodStartMs,
	changeAtMs,
	customAnchorMs,
}: {
	change: RelistChange;
	anchor: RelistAnchor;
	proration: RelistProration;
	cancelsAtRenewal: boolean;
	periodStartMs: number;
	changeAtMs: number;
	customAnchorMs: number;
}): StripeTimeline => {
	const billsNow = proration !== "none";
	const { items: after, meteredKept } = AFTER[change];
	const periodEndMs = addMonths(periodStartMs, 1).getTime();
	const unusedRatio = ratioBetween({
		from: changeAtMs,
		to: periodEndMs,
		over: [periodStartMs, periodEndMs],
	});
	const kept = after.filter((item) => has(BEFORE, item));
	const added = after.filter((item) => !has(BEFORE, item));
	const removed = BEFORE.filter((item) => !has(after, item));
	const usageCents = cents(OVERAGE);
	const addedCents =
		proration === "bill_difference"
			? sumCents(added)
			: sumCents(added, unusedRatio);
	const proratedChangeCents = billsNow
		? addedCents - sumCents(removed, unusedRatio)
		: 0;
	const renewalLicensedCents = cancelsAtRenewal ? 0 : sumCents(after);

	if (anchor === "now") {
		const newEndMs = addMonths(changeAtMs, 1).getTime();
		const extension = ratioBetween({
			from: periodEndMs,
			to: newEndMs,
			over: [changeAtMs, newEndMs],
		});
		const resetCents = billsNow
			? sumCents(kept, extension) +
				sumCents(added) -
				sumCents(removed, unusedRatio)
			: sumCents(added);
		return {
			executeCents: resetCents + usageCents,
			executeUsage: true,
			anchorCents: 0,
			anchorUsage: false,
			renewalCents: renewalLicensedCents,
			renewalUsage: false,
			usageAfterChange: 0,
			periodEnd: "change+1mo",
			nextCycle: {
				startsAt: "change+1mo",
				cents: cancelsAtRenewal ? 0 : sumCents(after),
			},
		};
	}

	const usageBilledAtChange = !meteredKept && billsNow;
	const atChange = {
		executeCents: proratedChangeCents + (usageBilledAtChange ? usageCents : 0),
		executeUsage: usageBilledAtChange,
		usageAfterChange: meteredKept ? RELIST.tracked : 0,
		periodEnd: "period_start+1mo" as RelistDate,
	};

	if (anchor === "custom") {
		const anchorEndMs = addMonths(customAnchorMs, 1).getTime();
		const extension = ratioBetween({
			from: periodEndMs,
			to: anchorEndMs,
			over: [customAnchorMs, anchorEndMs],
		});
		return {
			...atChange,
			anchorCents:
				(billsNow ? sumCents(after, extension) : 0) +
				(meteredKept ? usageCents : 0),
			anchorUsage: meteredKept,
			renewalCents: renewalLicensedCents,
			renewalUsage: false,
			nextCycle: billsNow
				? { startsAt: "custom_anchor", cents: sumCents(after, extension) }
				: { startsAt: "custom_anchor+1mo", cents: sumCents(after) },
		};
	}

	return {
		...atChange,
		anchorCents: 0,
		anchorUsage: false,
		renewalCents: renewalLicensedCents + (meteredKept ? usageCents : 0),
		renewalUsage: meteredKept,
		nextCycle: {
			startsAt: "period_start+1mo",
			cents: cancelsAtRenewal ? 0 : sumCents(after),
		},
	};
};

/**
 * No live sub (option 1): the old period closes, so its usage is billed now at the old price under
 * every proration (Stripe's reset semantics), and the listed plans start a new sub now.
 */
const noSubTimeline = ({
	change,
	anchor,
	proration,
	changeAtMs,
	customAnchorMs,
}: {
	change: RelistChange;
	anchor: RelistAnchor;
	proration: RelistProration;
	changeAtMs: number;
	customAnchorMs: number;
}): StripeTimeline => {
	const { items: after } = AFTER[change];
	const usageCents = cents(OVERAGE);
	if (anchor === "custom") {
		const stub = ratioBetween({
			from: changeAtMs,
			to: customAnchorMs,
			over: [addMonths(customAnchorMs, -1).getTime(), customAnchorMs],
		});
		return {
			executeCents:
				(proration === "none" ? 0 : sumCents(after, stub)) + usageCents,
			executeUsage: true,
			anchorCents: sumCents(after),
			anchorUsage: false,
			renewalCents: sumCents(after),
			renewalUsage: false,
			usageAfterChange: 0,
			periodEnd: "custom_anchor",
			nextCycle: { startsAt: "custom_anchor", cents: sumCents(after) },
		};
	}
	return {
		executeCents: sumCents(after) + usageCents,
		executeUsage: true,
		anchorCents: 0,
		anchorUsage: false,
		renewalCents: sumCents(after),
		renewalUsage: false,
		usageAfterChange: 0,
		periodEnd: "change+1mo",
		nextCycle: { startsAt: "change+1mo", cents: sumCents(after) },
	};
};

export type RelistStripeState = "live" | "no_sub";

export type RelistExpectationOptions = {
	/** The case stopped before the renewal (custom anchors stop at the anchor invoice). */
	renewalObserved?: boolean;
	/** Renewals of other subs the customer keeps (multi-sub state). */
	otherRenewals?: number;
	/** The plan is canceling: a re-list keeps the cancellation, so the period end bills only kept usage and next_cycle is $0. */
	cancelsAtRenewal?: boolean;
};

export const expectedRelistBilling = ({
	state,
	change,
	anchor,
	proration,
	run,
	renewalObserved = true,
	otherRenewals = 0,
	cancelsAtRenewal = false,
}: {
	state: RelistStripeState;
	change: RelistChange;
	anchor: RelistAnchor;
	proration: RelistProration;
	run: RelistRun;
} & RelistExpectationOptions): RelistBilling => {
	const timeline =
		state === "no_sub"
			? noSubTimeline({ change, anchor, proration, ...run })
			: liveTimeline({
					change,
					anchor,
					proration,
					cancelsAtRenewal,
					...run,
				});
	const usageLine = (billed: boolean) => (billed ? [OVERAGE] : []);
	return {
		executeTotal: dollars(timeline.executeCents),
		executeMessages: usageLine(timeline.executeUsage),
		anchorTotal: dollars(timeline.anchorCents),
		anchorMessages: usageLine(timeline.anchorUsage),
		renewalTotal: renewalObserved
			? dollars(timeline.renewalCents) + otherRenewals
			: 0,
		renewalMessages: renewalObserved ? usageLine(timeline.renewalUsage) : [],
		messagesUsage: timeline.usageAfterChange,
		periodEnd: timeline.periodEnd,
		nextCycle: timeline.nextCycle && {
			startsAt: timeline.nextCycle.startsAt,
			total: dollars(timeline.nextCycle.cents),
		},
	};
};

/** Stripe bills both runs identically when their timelines match: then Autumn must too, end to end. */
export const stripeTreatsAlike = (
	args: RelistExpectationOptions & {
		state: RelistStripeState;
		change: RelistChange;
		anchor: RelistAnchor;
		proration: RelistProration;
		unchanged: RelistRun;
		changed: RelistRun;
	},
) =>
	Bun.deepEquals(
		expectedRelistBilling({
			...args,
			change: "unchanged",
			run: args.unchanged,
		}),
		expectedRelistBilling({ ...args, run: args.changed }),
	);

/** Autumn's own promise: the preview total is exactly what execute invoices. */
export const expectPreviewMatchesExecution = ({ run }: { run: RelistRun }) => {
	expect(run.observation.preview.total).toBe(
		relistBilling(run.observation).executeTotal,
	);
};

export const expectRelistMatchesStripe = (args: {
	state: RelistStripeState;
	change: RelistChange;
	anchor: RelistAnchor;
	proration: RelistProration;
	run: RelistRun;
}) => {
	expect(relistBilling(args.run.observation)).toEqual(
		expectedRelistBilling(args),
	);
	expectPreviewMatchesExecution({ run: args.run });
};

/** The pairing check: same Stripe outcome means the same Autumn outcome, compared field by field. */
export const expectRelistPairConsistent = (
	args: RelistExpectationOptions & {
		state: RelistStripeState;
		change: RelistChange;
		anchor: RelistAnchor;
		proration: RelistProration;
		unchanged: RelistRun;
		changed: RelistRun;
	},
) => {
	if (!stripeTreatsAlike(args)) return;
	expect(args.changed.observation).toEqual(args.unchanged.observation);
};
