import {
	type Customer,
	type DeferredSetupPaymentData,
	MetadataType,
	type SetupPaymentParamsV1,
} from "@autumn/shared";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { createStripeSessionWithCardFallback } from "@/internal/billing/v2/providers/stripe/utils/checkoutSessions/createStripeSessionWithCardFallback";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { toSuccessUrl } from "@/internal/orgs/orgUtils/convertOrgUtils";
import { generateId } from "@/utils/genUtils";

/**
 * Inserts deferred metadata so the webhook can attach the plan after setup completes.
 */
const insertSetupPaymentMetadata = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: SetupPaymentParamsV1;
}) => {
	const payload: DeferredSetupPaymentData = {
		requestId: ctx.id,
		orgId: ctx.org.id,
		env: ctx.env,
		params,
	};

	return MetadataService.insert({
		db: ctx.db,
		data: {
			id: generateId("meta"),
			type: MetadataType.SetupPaymentV2,
			data: payload,
			created_at: Date.now(),
			expires_at: addDays(Date.now(), 10).getTime(),
		},
	});
};

/**
 * Creates a Stripe checkout session in setup mode.
 * If plan_id is specified, stores metadata so the webhook can attach the plan after setup.
 */
export const createSetupCheckoutSession = async ({
	ctx,
	customer,
	params,
}: {
	ctx: AutumnContext;
	customer: Customer;
	params: SetupPaymentParamsV1;
}) => {
	const { org, env, logger } = ctx;
	const stripeCli = createStripeCli({ org, env });

	// 1. Insert metadata (if plan_id specified)
	const metadata = params.plan_id
		? await insertSetupPaymentMetadata({ ctx, params })
		: null;

	// 2. Build session params
	const fullParams: Stripe.Checkout.SessionCreateParams = {
		customer: customer.processor?.id ?? undefined,
		mode: "setup",
		success_url: params.success_url || toSuccessUrl({ org, env }),
		currency: org.default_currency || "usd",
		...params.checkout_session_params,
		...(metadata ? { metadata: { autumn_metadata_id: metadata.id } } : {}),
	};

	// 3. Create session with card-type fallback
	const session = await createStripeSessionWithCardFallback({
		stripeCli,
		params: fullParams,
	});

	logger.info(
		`Created setup checkout session for ${customer.id ?? customer.internal_id}`,
	);

	// 4. Link metadata to checkout session
	if (metadata) {
		await MetadataService.update({
			db: ctx.db,
			id: metadata.id,
			updates: { stripe_checkout_session_id: session.id },
		});
	}

	return { url: session.url };
};
