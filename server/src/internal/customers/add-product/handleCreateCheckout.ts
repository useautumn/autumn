import {
	type AttachConfig,
	AttachFunctionResponseSchema,
	MetadataType,
	RecaseError,
	SuccessCode,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getStripeSubItems } from "@/external/stripe/stripeSubUtils/getStripeSubItems.js";
import { toSuccessUrl } from "@/internal/orgs/orgUtils/convertOrgUtils.js";
import { orgToCurrency } from "@/internal/orgs/orgUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getNextStartOfMonthUnix } from "@/internal/products/prices/billingIntervalUtils.js";
import { pricesContainRecurring } from "@/internal/products/prices/priceUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import type { AutumnContext } from "../../../honoUtils/HonoEnv.js";
import { attachParamsToMetadata } from "../../billing/attach/utils/attachParamsToMetadata.js";
import type { AttachParams } from "../cusProducts/AttachParams.js";

export const handleCreateCheckout = async ({
	ctx,
	attachParams,
	// biome-ignore lint/correctness/noUnusedFunctionParameters: Might be used in the future
	config,
	returnCheckout = false,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
	returnCheckout?: boolean;
}) => {
	const { db, logger } = ctx;

	const { customer, org, freeTrial, successUrl, rewards } = attachParams;

	const stripeCli = createStripeCli({
		org,
		env: customer.env,
		legacyVersion: true,
	});

	const itemSets = await getStripeSubItems({
		attachParams,
		isCheckout: true,
	});

	if (itemSets.length === 0) {
		throw new RecaseError({
			message: `Product ${attachParams.products.map((p) => p.name).join(", ")} has no prices, can't create checkout`,
		});
	}

	const { items } = itemSets[0];

	attachParams.itemSets = itemSets;

	const isRecurring = pricesContainRecurring(attachParams.prices);

	// Insert metadata
	const metadata = await attachParamsToMetadata({
		db,
		attachParams,
		type: MetadataType.CheckoutSessionCompleted,
	});

	let billingCycleAnchorUnixSeconds = org.config.anchor_start_of_month
		? Math.floor(
				getNextStartOfMonthUnix({
					interval: itemSets[0].interval,
					intervalCount: itemSets[0].intervalCount,
				}) / 1000,
			)
		: undefined;

	if (attachParams.billingAnchor) {
		billingCycleAnchorUnixSeconds = Math.floor(
			attachParams.billingAnchor / 1000,
		);
	}

	const subscriptionData:
		| Stripe.Checkout.SessionCreateParams.SubscriptionData
		| undefined = isRecurring
		? {
				trial_end:
					freeTrial && !attachParams.disableFreeTrial
						? freeTrialToStripeTimestamp({ freeTrial })
						: undefined,
				trial_settings:
					freeTrial && !attachParams.disableFreeTrial && freeTrial.card_required
						? {
								end_behavior: {
									missing_payment_method: "cancel",
								},
							}
						: undefined,
				billing_cycle_anchor: billingCycleAnchorUnixSeconds,
			}
		: undefined;

	const checkoutParams = attachParams.checkoutSessionParams as
		| Partial<Stripe.Checkout.SessionCreateParams>
		| undefined;
	const allowPromotionCodes =
		notNullish(checkoutParams?.discounts) || notNullish(rewards)
			? undefined
			: checkoutParams?.allow_promotion_codes || true;

	let rewardData = {};
	if (rewards) {
		rewardData = {
			discounts: rewards.map((r) => ({ coupon: r.id })),
		};
	}

	// Prepare checkout session parameters
	let checkout: Stripe.Checkout.Session | undefined;

	const paymentMethodSet =
		notNullish(checkoutParams?.payment_method_types) ||
		notNullish(checkoutParams?.payment_method_configuration);

	let sessionParams: Stripe.Checkout.SessionCreateParams = {
		customer: customer.processor.id,
		line_items: items,
		subscription_data: subscriptionData,
		mode: isRecurring ? "subscription" : "payment",
		currency: orgToCurrency({ org }),
		success_url: successUrl || toSuccessUrl({ org, env: customer.env }),

		allow_promotion_codes: allowPromotionCodes,
		invoice_creation: !isRecurring ? { enabled: true } : undefined,
		saved_payment_method_options: { payment_method_save: "enabled" },

		...rewardData,
		...(attachParams.checkoutSessionParams || {}),
		metadata: {
			...(attachParams.metadata ? attachParams.metadata : {}),
			...(checkoutParams?.metadata || {}),
			autumn_metadata_id: metadata.id,
		},
		payment_method_collection:
			freeTrial &&
			!attachParams.disableFreeTrial &&
			freeTrial.card_required === false
				? "if_required"
				: undefined,
	};

	if (attachParams.setupPayment) {
		sessionParams = {
			customer: customer.processor?.id,
			mode: "setup",
			success_url: successUrl || toSuccessUrl({ org, env: customer.env }),
			currency: org.default_currency || "usd",
			...checkoutParams,
			metadata: {
				...(checkoutParams?.metadata || {}),
				autumn_metadata_id: metadata.id,
			},
		};
	}

	try {
		checkout = await stripeCli.checkout.sessions.create(sessionParams);
		logger.info(
			`✅ Successfully created checkout for customer ${customer.id || customer.internal_id}`,
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : undefined;
		if (msg?.includes("No valid payment method types") && !paymentMethodSet) {
			checkout = await stripeCli.checkout.sessions.create({
				...sessionParams,
				payment_method_types: ["card"],
			});

			logger.info(
				`✅ Created fallback checkout session with card payment method for customer ${customer.id || customer.internal_id}`,
			);
		} else {
			throw error;
		}
	}

	const customerId = customer.id || customer.internal_id;
	const productNames = attachParams.products.map((p) => p.name).join(", ");
	return AttachFunctionResponseSchema.parse({
		checkout_url: checkout?.url,
		message: `Successfully created checkout for customer ${customerId}, product(s) ${productNames}`,
		code: SuccessCode.CheckoutCreated,

		checkoutSession: checkout,
	});

	// if (returnCheckout || !res) {
	// 	return checkout;
	// }

	// if (req.apiVersion.gte(ApiVersion.V1_1)) {
	// 	res.status(200).json(
	// 		AttachResultSchema.parse({
	// 			checkout_url: checkout.url,
	// 			code: SuccessCode.CheckoutCreated,
	// 			message: `Successfully created checkout for customer ${
	// 				customer.id || customer.internal_id
	// 			}, product(s) ${attachParams.products.map((p) => p.name).join(", ")}`,
	// 			product_ids: attachParams.products.map((p) => p.id),
	// 			customer_id: customer.id || customer.internal_id,
	// 		}),
	// 	);
	// } else {
	// 	res.status(200).json({
	// 		checkout_url: checkout.url,
	// 	});
	// }
};
