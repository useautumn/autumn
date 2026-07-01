import type {
	BillingContext,
	StripeSubscriptionScheduleAction,
} from "@autumn/shared";
import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type Stripe from "stripe";
import { findMatchingInlinePriceIdForPhaseItem } from "@/internal/billing/v2/providers/stripe/utils/matchUtils/matchStripeInlinePrice";
import { logSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/logSubscriptionScheduleAction";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/** Maps update phase format to create phase format and propagates Autumn metadata. */
const toCreatePhase = (
	phase: Stripe.SubscriptionScheduleUpdateParams.Phase,
): Stripe.SubscriptionScheduleCreateParams.Phase => ({
	items: phase.items?.map((item) => ({
		...(item.price_data
			? { price_data: item.price_data }
			: { price: item.price }),
		quantity: item.quantity,
		...(item.metadata && { metadata: item.metadata }),
	})),
	...(phase.add_invoice_items && {
		add_invoice_items:
			phase.add_invoice_items as Stripe.SubscriptionScheduleCreateParams.Phase.AddInvoiceItem[],
	}),
	end_date: typeof phase.end_date === "number" ? phase.end_date : undefined,
	proration_behavior: phase.proration_behavior,
	discounts: phase.discounts as
		| Stripe.SubscriptionScheduleCreateParams.Phase.Discount[]
		| undefined,
	metadata: { ...(phase.metadata ?? {}), autumn_managed: "true" },
});

/** Builds phases for updating a schedule created from a subscription. */
const buildAnchoredPhases = ({
	params,
	existingSchedule,
	stripeSubscription,
}: {
	params: { phases?: Stripe.SubscriptionScheduleUpdateParams.Phase[] };
	existingSchedule: Stripe.SubscriptionSchedule;
	stripeSubscription?: Stripe.Subscription;
}): Stripe.SubscriptionScheduleUpdateParams.Phase[] => {
	const inputPhases = params.phases ?? [];
	if (inputPhases.length === 0) return [];

	const currentPhaseStart = existingSchedule.current_phase?.start_date;
	if (!currentPhaseStart) {
		throw new Error("Cannot update schedule: missing current phase start_date");
	}

	const subItemMetadataByPriceId = new Map<string, Record<string, string>>();
	if (stripeSubscription) {
		for (const subItem of stripeSubscription.items.data) {
			if (subItem.metadata && Object.keys(subItem.metadata).length > 0) {
				subItemMetadataByPriceId.set(subItem.price.id, subItem.metadata);
			}
		}
	}

	// Stripe's from_subscription strips item metadata, but subscription items keep it.
	const existingFirstPhaseItems: Stripe.SubscriptionScheduleUpdateParams.Phase["items"] =
		existingSchedule.phases[0]?.items.map((item) => {
			const priceId =
				typeof item.price === "string" ? item.price : item.price?.id;

			const subMetadata = priceId
				? subItemMetadataByPriceId.get(priceId)
				: undefined;
			const metadata =
				subMetadata ??
				(item.metadata && Object.keys(item.metadata).length > 0
					? item.metadata
					: undefined);

			return {
				price: priceId,
				quantity: item.quantity ?? undefined,
				...(metadata && { metadata }),
			};
		});

	const futurePhases = reuseCurrentInlinePricesInFuturePhases({
		phases: inputPhases.slice(1),
		stripeSubscription,
	});

	// Stripe rejects active phase item edits, so the first phase must mirror it.
	return [
		{
			...inputPhases[0],
			start_date: currentPhaseStart,
			items: existingFirstPhaseItems ?? inputPhases[0].items,
		},
		...futurePhases,
	];
};

type SchedulePhase = Stripe.SubscriptionScheduleUpdateParams.Phase;

const getId = <T extends { id: string }>(value?: string | T | null) =>
	typeof value === "string" ? value : value?.id;

const reuseCurrentInlinePricesInFuturePhases = ({
	phases,
	stripeSubscription,
}: {
	phases: SchedulePhase[];
	stripeSubscription?: Stripe.Subscription;
}): SchedulePhase[] => {
	return phases.map((phase) => {
		const usedSubscriptionItemIds = new Set<string>();

		return {
			...phase,
			items: phase.items?.map((item) => {
				/** Preserve current inline prices across phases so Stripe keeps item period anchors. */
				const priceId = findMatchingInlinePriceIdForPhaseItem({
					phaseItem: item,
					stripeSubscription,
					usedSubscriptionItemIds,
				});

				if (!priceId) return item;

				return {
					price: priceId,
					quantity: item.quantity,
					...(item.metadata && { metadata: item.metadata }),
				};
			}),
		};
	});
};

const schedulePhaseToUpdatePhase = (
	phase: Stripe.SubscriptionSchedule.Phase,
): Stripe.SubscriptionScheduleUpdateParams.Phase => ({
	start_date: phase.start_date,
	end_date: phase.end_date,
	items: phase.items.map((item) => ({
		price: getId(item.price),
		quantity: item.quantity,
		...(item.metadata && { metadata: item.metadata }),
		...(item.tax_rates?.length && {
			tax_rates: item.tax_rates.map((taxRate) => getId(taxRate)!),
		}),
	})),
	proration_behavior: phase.proration_behavior,
	...(phase.billing_cycle_anchor && {
		billing_cycle_anchor: phase.billing_cycle_anchor,
	}),
	...(phase.discounts?.length && {
		discounts: phase.discounts.map((discount) => ({
			...(getId(discount.coupon) && { coupon: getId(discount.coupon) }),
			...(getId(discount.promotion_code) && {
				promotion_code: getId(discount.promotion_code),
			}),
		})),
	}),
	...(phase.metadata && { metadata: phase.metadata }),
});

const getRestorableSchedulePhases = (
	schedule: Stripe.SubscriptionSchedule,
) => {
	const currentPhaseStart = schedule.current_phase?.start_date;
	if (!currentPhaseStart) return schedule.phases;

	return schedule.phases.filter((phase) => phase.end_date > currentPhaseStart);
};

/**
 * Creates a schedule from an existing subscription and updates it with phases.
 * This is the standard pattern for both "create" and "update" actions.
 */
const createScheduleFromSubscription = async ({
	stripeCli,
	subscriptionId,
	params,
	stripeSubscription,
}: {
	stripeCli: Stripe;
	subscriptionId: string;
	params: Stripe.SubscriptionScheduleUpdateParams;
	stripeSubscription?: Stripe.Subscription;
}): Promise<Stripe.SubscriptionSchedule> => {
	const schedule = await stripeCli.subscriptionSchedules.create({
		from_subscription: subscriptionId,
	});

	const phases = buildAnchoredPhases({
		params,
		existingSchedule: schedule,
		stripeSubscription,
	});

	return await stripeCli.subscriptionSchedules.update(schedule.id, {
		phases,
		end_behavior: params.end_behavior,
	});
};

export const restoreReleasedSubscriptionSchedule = async ({
	ctx,
	billingContext,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	stripeSubscription?: Stripe.Subscription;
}) => {
	const releasedSchedule = billingContext.stripeSubscriptionSchedule;
	const subscriptionId = getId(releasedSchedule?.subscription);

	if (!releasedSchedule || !subscriptionId) {
		throw new Error(
			"[executeStripeBillingPlan] Cannot restore released subscription schedule: missing schedule snapshot",
		);
	}

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const restoredSchedule = await createScheduleFromSubscription({
		stripeCli,
		subscriptionId,
		params: {
			phases: getRestorableSchedulePhases(releasedSchedule).map(
				schedulePhaseToUpdatePhase,
			),
			end_behavior: releasedSchedule.end_behavior,
		},
		stripeSubscription,
	});

	await CusProductService.updateByStripeScheduledId({
		db: ctx.db,
		stripeScheduledId: releasedSchedule.id,
		updates: {
			scheduled_ids: [restoredSchedule.id],
		},
	});

	ctx.logger.info(
		`[executeStripeBillingPlan] Restored released subscription schedule ${releasedSchedule.id} as ${restoredSchedule.id} after later Stripe action failed`,
	);
};

const getStandaloneScheduleDefaults = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): Partial<Stripe.SubscriptionScheduleCreateParams> => {
	const paymentMethod = billingContext.paymentMethod;
	const shouldSendInvoice = !paymentMethod || paymentMethod.type === "custom";

	if (!shouldSendInvoice) return {};

	return {
		default_settings: {
			collection_method: "send_invoice",
			invoice_settings: {
				days_until_due: 30,
			},
		},
	};
};

export const executeStripeSubscriptionScheduleAction = async ({
	ctx,
	billingContext,
	subscriptionScheduleAction,
	stripeSubscription,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	subscriptionScheduleAction: StripeSubscriptionScheduleAction;
	stripeSubscription?: Stripe.Subscription;
}): Promise<Stripe.SubscriptionSchedule | null> => {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	logSubscriptionScheduleAction({
		ctx,
		billingContext,
		subscriptionScheduleAction,
	});

	ctx.logger.debug(
		`[executeStripeSubscriptionScheduleAction] Executing subscription schedule operation: ${subscriptionScheduleAction.type}`,
	);

	switch (subscriptionScheduleAction.type) {
		case "create": {
			const { params } = subscriptionScheduleAction;

			// If there's an existing subscription, create schedule from it
			if (stripeSubscription) {
				return await createScheduleFromSubscription({
					stripeCli,
					subscriptionId: stripeSubscription.id,
					params,
					stripeSubscription,
				});
			}

			// No subscription - create standalone schedule
			const startDate = params.phases?.[0]?.start_date;
			return await stripeCli.subscriptionSchedules.create({
				customer: billingContext.stripeCustomer?.id ?? "none",
				phases: params.phases?.map(toCreatePhase) ?? [],
				end_behavior: params.end_behavior,
				start_date: startDate,
				...getStandaloneScheduleDefaults({ billingContext }),
			});
		}

		case "update": {
			const { stripeSubscriptionScheduleId, params } =
				subscriptionScheduleAction;

			// Get the subscription ID from the existing schedule
			const subscriptionId =
				billingContext.stripeSubscriptionSchedule?.subscription;
			if (!subscriptionId) {
				// Standalone future schedules have no subscription until they start.
				// Update them in place instead of releasing and recreating from a sub.
				return await stripeCli.subscriptionSchedules.update(
					stripeSubscriptionScheduleId,
					params,
				);
			}

			// Always release + recreate to avoid "can't modify active phase" errors
			// The subscription may have been updated first, changing its items
			await stripeCli.subscriptionSchedules.release(
				stripeSubscriptionScheduleId,
			);

			const newSchedule = await createScheduleFromSubscription({
				stripeCli,
				subscriptionId:
					typeof subscriptionId === "string"
						? subscriptionId
						: subscriptionId.id,
				params,
				stripeSubscription,
			});

			// Update existing customer products with the new schedule ID
			await CusProductService.updateByStripeScheduledId({
				db: ctx.db,
				stripeScheduledId: stripeSubscriptionScheduleId,
				updates: {
					scheduled_ids: [newSchedule.id],
				},
			});

			return newSchedule;
		}

		case "release":
			ctx.logger.debug(
				`[executeStripeSubscriptionScheduleAction] Releasing schedule: ${subscriptionScheduleAction.stripeSubscriptionScheduleId}`,
			);
			await stripeCli.subscriptionSchedules.release(
				subscriptionScheduleAction.stripeSubscriptionScheduleId,
			);
			return null;

		case "cancel":
			ctx.logger.debug(
				`[executeStripeSubscriptionScheduleAction] Canceling schedule: ${subscriptionScheduleAction.stripeSubscriptionScheduleId}`,
			);
			await stripeCli.subscriptionSchedules.cancel(
				subscriptionScheduleAction.stripeSubscriptionScheduleId,
			);
			return null;
	}
};
