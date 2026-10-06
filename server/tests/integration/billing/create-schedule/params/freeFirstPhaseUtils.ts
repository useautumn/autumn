import {
	type AttachPreviewResponse,
	type CreateScheduleParamsV0Input,
	ms,
} from "@autumn/shared";
import type { initScenario } from "@tests/utils/testInitUtils/initScenario";
import type Stripe from "stripe";

export const findSchedulePhase = ({
	schedule,
	startsAt,
}: {
	schedule: Stripe.SubscriptionSchedule;
	startsAt: number;
}) =>
	schedule.phases.find(
		(phase) => Math.abs(phase.start_date * 1000 - startsAt) < ms.minutes(1),
	);

export const findSchedulePhaseAt = ({
	schedule,
	timestamp,
}: {
	schedule: Stripe.SubscriptionSchedule;
	timestamp: number;
}) =>
	schedule.phases.find(
		(phase) =>
			phase.start_date * 1000 <= timestamp &&
			(!phase.end_date || phase.end_date * 1000 > timestamp),
	);

export const expandedStripePrice = (
	price: Stripe.SubscriptionSchedule.Phase.Item["price"] | undefined,
) =>
	price && typeof price !== "string" && !("deleted" in price)
		? price
		: undefined;

export const newInvoices = ({
	beforeIds,
	invoices,
}: {
	beforeIds: Set<string>;
	invoices: Stripe.Invoice[];
}) => invoices.filter((invoice) => !beforeIds.has(invoice.id));

export const previewCreateSchedule = async ({
	autumnV1,
	params,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	params: CreateScheduleParamsV0Input;
}): Promise<AttachPreviewResponse> =>
	await autumnV1.post("/billing.preview_create_schedule", params);
