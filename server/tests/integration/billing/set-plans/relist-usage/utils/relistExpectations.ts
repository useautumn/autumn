import {
	type RelistBilling,
	type RelistProration,
	type RelistShape,
	stripeResetExtension,
} from "./relistScenario";

/** Values come from handoffs/ATMN-746/stripe-relist-no-sub.md (Stripe sandbox, real test clocks). */

const overageAtOldPrice = (shape: RelistShape) =>
	Math.round(
		Math.max(shape.tracked - shape.includedUsage, 0) * shape.unitPrice * 100,
	) / 100;

/**
 * No live Stripe sub (Charlie's option 1, reset semantics of Stripe g / sg): the old period's usage is
 * billed now at the price it was used at under every proration, a new sub starts now with a full
 * first period (Stripe n: $20 on create), usage resets.
 */
export const expectedNoSubRelist = ({
	shape,
}: {
	shape: RelistShape;
}): RelistBilling => {
	const usage = overageAtOldPrice(shape);
	const flat = shape.flatPrice ?? 0;
	return {
		preview: {
			total: flat + usage,
			messages: [usage],
			nextCycle: { startsAt: "change+1mo", total: flat },
		},
		executeTotal: flat + usage,
		executeMessages: [usage],
		subscription: { anchor: "change", periodEnd: "change+1mo" },
		balance: { usage: 0, remaining: shape.includedUsage },
		renewalTotal: flat,
		renewalMessages: [],
	};
};

/**
 * Live sub, billing_cycle_anchor phase_start (Stripe g_* and sg_*, identical for both prices): usage
 * billed at the reset at the old price under every proration; flat is the netted extension, $0 on none.
 */
export const expectedLiveResetNowRelist = ({
	shape,
	proration,
	clockStartMs,
}: {
	shape: RelistShape;
	proration: RelistProration;
	clockStartMs: number;
}): RelistBilling => {
	const usage = overageAtOldPrice(shape);
	const flat = shape.flatPrice ?? 0;
	const flatAtReset =
		proration === "none"
			? 0
			: stripeResetExtension({ amount: flat, clockStartMs });
	const total = Math.round((flatAtReset + usage) * 100) / 100;
	return {
		preview: {
			total,
			messages: [usage],
			nextCycle: { startsAt: "change+1mo", total: flat },
		},
		executeTotal: total,
		executeMessages: [usage],
		subscription: { anchor: "change", periodEnd: "change+1mo" },
		balance: { usage: 0, remaining: shape.includedUsage },
		renewalTotal: flat,
		renewalMessages: [],
	};
};

/**
 * Live sub, anchor unchanged. Stripe's own split, not a bug: a kept price carries the usage to renewal
 * (ATMN-729 e); a swapped price bills it now at the old price (s_ai), or never under none (s_none).
 */
export const expectedLiveKeptAnchorRelist = ({
	shape,
	proration,
	priceChanged,
}: {
	shape: RelistShape;
	proration: RelistProration;
	priceChanged: boolean;
}): RelistBilling => {
	const usage = overageAtOldPrice(shape);
	const flat = shape.flatPrice ?? 0;
	const billedNow = priceChanged && proration !== "none" ? usage : 0;
	const carried = priceChanged ? 0 : usage;
	return {
		preview: {
			total: billedNow,
			messages: billedNow ? [billedNow] : [],
			nextCycle: { startsAt: "start+1mo", total: flat },
		},
		executeTotal: billedNow,
		executeMessages: billedNow ? [billedNow] : [],
		subscription: { anchor: "start", periodEnd: "start+1mo" },
		balance: priceChanged
			? { usage: 0, remaining: shape.includedUsage }
			: {
					usage: shape.tracked,
					remaining: shape.includedUsage - shape.tracked,
				},
		renewalTotal: flat + carried,
		renewalMessages: carried ? [carried] : [],
	};
};
