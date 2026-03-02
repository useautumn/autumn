import type {
	BillingContext,
	StripeSubscriptionScheduleAction,
} from "@autumn/shared";
import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import type Stripe from "stripe";
import { logSubscriptionScheduleAction } from "@/internal/billing/v2/providers/stripe/utils/subscriptionSchedules/logSubscriptionScheduleAction";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/**
 * Maps update phase format to create phase format (strips start_date).
 * Preserves discounts so they carry forward to the new schedule phases.
 */
const toCreatePhase = (
	phase: Stripe.SubscriptionScheduleUpdateParams.Phase,
): Stripe.SubscriptionScheduleCreateParams.Phase => ({
	items: phase.items?.map((item) => ({
		price: item.price,
		quantity: item.quantity,
		...(item.metadata && { metadata: item.metadata }),
	})),
	end_date: typeof phase.end_date === "number" ? phase.end_date : undefined,
	discounts: phase.discounts as
		| Stripe.SubscriptionScheduleCreateParams.Phase.Discount[]
		| undefined,
});

/**
 * Builds phases for updating a schedule that was created from a subscription.
 * The first phase must use the schedule's actual current phase start_date AND items.
 * Stripe doesn't allow modifying items in an active phase, so we preserve them exactly.
 *
 * Stripe's `from_subscription` doesn't copy item-level metadata onto schedule phase items,
 * so we re-apply metadata from the subscription items (which DO have it) by matching price ID.
 */
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

	// Build a lookup of price ID → metadata from the subscription items
	const subItemMetadataByPriceId = new Map<string, Record<string, string>>();
	if (stripeSubscription) {
		for (const subItem of stripeSubscription.items.data) {
			if (subItem.metadata && Object.keys(subItem.metadata).length > 0) {
				subItemMetadataByPriceId.set(subItem.price.id, subItem.metadata);
			}
		}
	}

	// Map existing items to update format (response type -> request type)
	// Re-apply metadata from subscription items since Stripe's from_subscription strips it
	const existingFirstPhaseItems: Stripe.SubscriptionScheduleUpdateParams.Phase["items"] =
		existingSchedule.phases[0]?.items.map((item) => {
			const priceId =
				typeof item.price === "string" ? item.price : item.price?.id;

			// Prefer metadata from the subscription item (reliable source)
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

	// First phase: preserve start_date AND items from existing schedule
	// Stripe doesn't allow modifying items in an active/in-progress phase
	// The actual current state is managed by the subscription, not the schedule
	// Future phases: keep as-is (these define what happens at phase transitions)
	return [
		{
			...inputPhases[0],
			start_date: currentPhaseStart,
			items: existingFirstPhaseItems ?? inputPhases[0].items,
		},
		...inputPhases.slice(1),
	];
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
			return await stripeCli.subscriptionSchedules.create({
				customer: billingContext.stripeCustomer.id,
				phases: params.phases?.map(toCreatePhase) ?? [],
				end_behavior: params.end_behavior,
			});
		}

		case "update": {
			const { stripeSubscriptionScheduleId, params } =
				subscriptionScheduleAction;

			// Always release + recreate to avoid "can't modify active phase" errors
			// The subscription may have been updated first, changing its items
			await stripeCli.subscriptionSchedules.release(
				stripeSubscriptionScheduleId,
			);

			// Get the subscription ID from the existing schedule
			const subscriptionId =
				billingContext.stripeSubscriptionSchedule?.subscription;
			if (!subscriptionId) {
				throw new Error(
					"Cannot update schedule: no subscription ID found on existing schedule",
				);
			}

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
	}
};
