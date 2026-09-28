import type { SyncPhase, SyncProposalV2 } from "@autumn/shared";
import type Stripe from "stripe";
import { formatStripeItemPrice } from "./formatStripeItemPrice";

export type DisplayItem = {
	key: string;
	name: string;
	priceLabel: string;
	stripePriceId: string;
};

export type PhaseSection = {
	phase: SyncPhase;
	displayItems: DisplayItem[];
};

const withQuantity = ({
	label,
	quantity,
}: {
	label: string;
	quantity?: number | null;
}) => (quantity && quantity > 1 ? `${label} × ${quantity}` : label);

const itemsFromStripeSubscription = ({
	sub,
}: {
	sub: Stripe.Subscription;
}): DisplayItem[] =>
	sub.items.data.map((item) => {
		const product = item.price?.product;
		const productName =
			typeof product === "object" && product && "name" in product
				? (product as { name: string }).name
				: (item.price?.id ?? "Unknown");
		return {
			key: item.id,
			name: productName,
			stripePriceId: item.price?.id ?? "",
			priceLabel: withQuantity({
				label: formatStripeItemPrice({ price: item.price }),
				quantity: item.quantity,
			}),
		};
	});

const itemsFromSchedulePhase = ({
	phase,
	phaseIndex,
}: {
	phase: Stripe.SubscriptionSchedule.Phase;
	phaseIndex: number;
}): DisplayItem[] =>
	phase.items.map((item, itemIndex) => {
		const price = item.price as
			| string
			| (Stripe.Price & { product?: string | Stripe.Product })
			| undefined;
		const expanded = typeof price === "object" ? price : null;
		const priceId = typeof price === "string" ? price : (expanded?.id ?? "");
		const product = expanded?.product;
		const productName =
			typeof product === "object" && product && "name" in product
				? product.name
				: priceId || "Unknown";
		return {
			key: `${phaseIndex}:${itemIndex}`,
			name: productName,
			stripePriceId: priceId,
			priceLabel: withQuantity({
				label: formatStripeItemPrice({ price: expanded }),
				quantity: item.quantity,
			}),
		};
	});

export const formatPhaseStart = (startsAt: SyncPhase["starts_at"]): string => {
	if (startsAt === "now") return "Starts now";
	return `Starts ${new Date(startsAt).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	})}`;
};

const findScheduleStartDateMs = ({
	phase,
}: {
	phase: Stripe.SubscriptionSchedule.Phase;
}) => phase.start_date * 1000;

export const buildPhaseSections = ({
	proposal,
}: {
	proposal: SyncProposalV2;
}): PhaseSection[] => {
	const sub = proposal.stripe_subscription;
	const schedule = proposal.stripe_schedule;

	return proposal.phases.map((phase): PhaseSection => {
		// Match by start date, not index: the backend drops phases with no plans.
		const matchingSchedulePhase = schedule
			? schedule.phases.find((schedulePhase) => {
					if (phase.starts_at === "now") {
						const endMs = schedulePhase.end_date
							? schedulePhase.end_date * 1000
							: Number.POSITIVE_INFINITY;
						return (
							findScheduleStartDateMs({ phase: schedulePhase }) <= Date.now() &&
							Date.now() < endMs
						);
					}
					return (
						findScheduleStartDateMs({ phase: schedulePhase }) ===
						phase.starts_at
					);
				})
			: undefined;

		if (matchingSchedulePhase && schedule) {
			const phaseIndex = schedule.phases.indexOf(matchingSchedulePhase);
			return {
				phase,
				displayItems: itemsFromSchedulePhase({
					phase: matchingSchedulePhase,
					phaseIndex,
				}),
			};
		}

		if (phase.starts_at === "now" && sub) {
			return { phase, displayItems: itemsFromStripeSubscription({ sub }) };
		}

		return { phase, displayItems: [] };
	});
};
