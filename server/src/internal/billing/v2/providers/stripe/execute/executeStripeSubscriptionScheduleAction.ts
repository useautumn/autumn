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

const getIds = <T extends { id: string }>(values?: (string | T)[] | null) =>
	values?.map((value) => getId(value)!).filter(Boolean);

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

const scheduleDiscountToUpdateDiscount = (
	discount: Pick<
		Stripe.SubscriptionSchedule.Phase.Discount,
		"coupon" | "promotion_code"
	>,
): Stripe.SubscriptionScheduleUpdateParams.Phase.Discount => ({
	...(getId(discount.coupon) && { coupon: getId(discount.coupon) }),
	...(getId(discount.promotion_code) && {
		promotion_code: getId(discount.promotion_code),
	}),
});

const scheduleAddInvoiceItemToUpdateItem = (
	item: Stripe.SubscriptionSchedule.Phase.AddInvoiceItem,
): Stripe.SubscriptionScheduleUpdateParams.Phase.AddInvoiceItem => ({
	price: getId(item.price),
	quantity: item.quantity ?? undefined,
	...(item.metadata && { metadata: item.metadata }),
	...(item.period && { period: item.period }),
	...(item.discounts?.length && {
		discounts: item.discounts.map(scheduleDiscountToUpdateDiscount),
	}),
	...(item.tax_rates?.length && {
		tax_rates: getIds(item.tax_rates),
	}),
});

const schedulePhaseItemToUpdateItem = (
	item: Stripe.SubscriptionSchedule.Phase.Item,
): Stripe.SubscriptionScheduleUpdateParams.Phase.Item => ({
	price: getId(item.price),
	quantity: item.quantity,
	...(item.billing_thresholds?.usage_gte !== null &&
		item.billing_thresholds?.usage_gte !== undefined && {
			billing_thresholds: {
				usage_gte: item.billing_thresholds.usage_gte,
			},
		}),
	...(item.discounts?.length && {
		discounts: item.discounts.map(scheduleDiscountToUpdateDiscount),
	}),
	...(item.metadata && { metadata: item.metadata }),
	...(item.tax_rates?.length && {
		tax_rates: getIds(item.tax_rates),
	}),
	...(item.trial && {
		trial: {
			type: item.trial.type,
			...(item.trial.converts_to?.length && {
				converts_to: item.trial.converts_to,
			}),
		},
	}),
});

const scheduleInvoiceSettingsToUpdateSettings = (
	invoiceSettings: Stripe.SubscriptionSchedule.Phase.InvoiceSettings,
): Stripe.SubscriptionScheduleUpdateParams.Phase.InvoiceSettings => ({
	...(invoiceSettings.account_tax_ids?.length && {
		account_tax_ids: getIds(invoiceSettings.account_tax_ids),
	}),
	...(invoiceSettings.days_until_due !== null && {
		days_until_due: invoiceSettings.days_until_due,
	}),
	...(invoiceSettings.issuer && {
		issuer: {
			type: invoiceSettings.issuer.type,
			...(getId(invoiceSettings.issuer.account) && {
				account: getId(invoiceSettings.issuer.account),
			}),
		},
	}),
});

const scheduleAutomaticTaxToUpdateAutomaticTax = (
	automaticTax: Stripe.SubscriptionSchedule.Phase.AutomaticTax,
): Stripe.SubscriptionScheduleUpdateParams.Phase.AutomaticTax => ({
	enabled: automaticTax.enabled,
	...(automaticTax.liability && {
		liability: {
			type: automaticTax.liability.type,
			...(getId(automaticTax.liability.account) && {
				account: getId(automaticTax.liability.account),
			}),
		},
	}),
});

const scheduleTransferDataToUpdateTransferData = (
	transferData: Stripe.SubscriptionSchedule.Phase.TransferData,
): Stripe.SubscriptionScheduleUpdateParams.Phase.TransferData => ({
	destination: getId(transferData.destination)!,
	...(transferData.amount_percent !== null && {
		amount_percent: transferData.amount_percent,
	}),
});

const scheduleTrialSettingsToUpdateTrialSettings = (
	trialSettings: Stripe.SubscriptionSchedule.Phase.TrialSettings,
): Stripe.SubscriptionScheduleUpdateParams.Phase.TrialSettings => ({
	...(trialSettings.end_behavior && {
		end_behavior: {
			...(trialSettings.end_behavior.prorate_up_front && {
				prorate_up_front: trialSettings.end_behavior.prorate_up_front,
			}),
		},
	}),
});

const schedulePhaseToUpdatePhase = (
	phase: Stripe.SubscriptionSchedule.Phase,
): Stripe.SubscriptionScheduleUpdateParams.Phase => ({
	start_date: phase.start_date,
	end_date: phase.end_date,
	items: phase.items.map(schedulePhaseItemToUpdateItem),
	...(phase.add_invoice_items?.length && {
		add_invoice_items: phase.add_invoice_items.map(
			scheduleAddInvoiceItemToUpdateItem,
		),
	}),
	...(phase.application_fee_percent !== null && {
		application_fee_percent: phase.application_fee_percent,
	}),
	...(phase.automatic_tax && {
		automatic_tax: scheduleAutomaticTaxToUpdateAutomaticTax(
			phase.automatic_tax,
		),
	}),
	proration_behavior: phase.proration_behavior,
	...(phase.billing_cycle_anchor && {
		billing_cycle_anchor: phase.billing_cycle_anchor,
	}),
	...(phase.billing_thresholds && {
		billing_thresholds: {
			...(phase.billing_thresholds.amount_gte !== null && {
				amount_gte: phase.billing_thresholds.amount_gte,
			}),
			...(phase.billing_thresholds.reset_billing_cycle_anchor !== null && {
				reset_billing_cycle_anchor:
					phase.billing_thresholds.reset_billing_cycle_anchor,
			}),
		},
	}),
	...(phase.collection_method && {
		collection_method: phase.collection_method,
	}),
	...(phase.currency && { currency: phase.currency }),
	...(getId(phase.default_payment_method) && {
		default_payment_method: getId(phase.default_payment_method),
	}),
	...(phase.default_tax_rates?.length && {
		default_tax_rates: getIds(phase.default_tax_rates),
	}),
	...(phase.description !== null && { description: phase.description }),
	...(phase.discounts?.length && {
		discounts: phase.discounts.map(scheduleDiscountToUpdateDiscount),
	}),
	...(phase.invoice_settings && {
		invoice_settings: scheduleInvoiceSettingsToUpdateSettings(
			phase.invoice_settings,
		),
	}),
	...(phase.metadata && { metadata: phase.metadata }),
	...(getId(phase.on_behalf_of) && { on_behalf_of: getId(phase.on_behalf_of) }),
	...(phase.pause_collection && { pause_collection: phase.pause_collection }),
	...(phase.transfer_data && {
		transfer_data: scheduleTransferDataToUpdateTransferData(
			phase.transfer_data,
		),
	}),
	...(phase.trial_continuation && {
		trial_continuation: phase.trial_continuation,
	}),
	...(phase.trial_end !== null && { trial_end: phase.trial_end }),
	...(phase.trial_settings && {
		trial_settings: scheduleTrialSettingsToUpdateTrialSettings(
			phase.trial_settings,
		),
	}),
});

const getRestorableSchedulePhases = (schedule: Stripe.SubscriptionSchedule) => {
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
