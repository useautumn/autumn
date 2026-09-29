import type { SyncPhase, SyncProposalV2 } from "@autumn/shared";
import { secondsToMilliseconds } from "date-fns";
import type Stripe from "stripe";
import { formatPhaseDate } from "@/components/forms/create-schedule/utils/schedulePhaseTiming";
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

const stripePriceToDisplayItem = ({
	key,
	price,
	quantity,
}: {
	key: string;
	price: string | Stripe.Price | null | undefined;
	quantity?: number | null;
}): DisplayItem => {
	const expanded = typeof price === "object" ? price : null;
	const priceId = typeof price === "string" ? price : (expanded?.id ?? "");
	const product = expanded?.product;
	const productName =
		typeof product === "object" && product && "name" in product
			? product.name
			: priceId || "Unknown";
	return {
		key,
		name: productName,
		stripePriceId: priceId,
		priceLabel: withQuantity({
			label: formatStripeItemPrice({ price: expanded }),
			quantity,
		}),
	};
};

export const formatPhaseStart = (startsAt: SyncPhase["starts_at"]): string =>
	startsAt === "now" ? "Starts now" : `Starts ${formatPhaseDate({ startsAt })}`;

export const buildPhaseSections = ({
	proposal,
}: {
	proposal: SyncProposalV2;
}): PhaseSection[] => {
	const sub = proposal.stripe_subscription;
	const schedule = proposal.stripe_schedule;

	const openSchedulePhases = (schedule?.phases ?? []).filter(
		(schedulePhase) =>
			!schedulePhase.end_date ||
			Date.now() < secondsToMilliseconds(schedulePhase.end_date),
	);

	return proposal.phases.map((phase, phaseIndex): PhaseSection => {
		const schedulePhase = openSchedulePhases[phaseIndex];
		if (schedulePhase) {
			return {
				phase,
				displayItems: schedulePhase.items.map((item, itemIndex) =>
					stripePriceToDisplayItem({
						key: `${phaseIndex}:${itemIndex}`,
						price: item.price as string | Stripe.Price | undefined,
						quantity: item.quantity,
					}),
				),
			};
		}

		if (phase.starts_at === "now" && sub) {
			return {
				phase,
				displayItems: sub.items.data.map((item) =>
					stripePriceToDisplayItem({
						key: item.id,
						price: item.price,
						quantity: item.quantity,
					}),
				),
			};
		}

		return { phase, displayItems: [] };
	});
};
