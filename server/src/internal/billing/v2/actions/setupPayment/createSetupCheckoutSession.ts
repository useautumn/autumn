import {
	type Customer,
	type DeferredSetupPaymentData,
	MetadataType,
	resolveCustomerCurrency,
	type SetupPaymentParamsV1,
} from "@autumn/shared";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { buildCheckoutSessionParams } from "@/internal/billing/v2/providers/stripe/utils/checkoutSessions/buildCheckoutSessionParams";
import { createStripeSessionWithCardFallback } from "@/internal/billing/v2/providers/stripe/utils/checkoutSessions/createStripeSessionWithCardFallback";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { toSuccessUrl } from "@/internal/orgs/orgUtils/convertOrgUtils";
import { generateId } from "@/utils/genUtils";

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

	const metadata = params.plan_id
		? await insertSetupPaymentMetadata({ ctx, params })
		: null;

	const fullParams = buildCheckoutSessionParams({
		params: {
			customer: customer.processor?.id ?? undefined,
			mode: "setup",
			success_url: params.success_url || toSuccessUrl({ org, env }),
		},
		checkoutSessionParams: params.checkout_session_params as
			| Partial<Stripe.Checkout.SessionCreateParams>
			| undefined,
		currency: resolveCustomerCurrency({ customer, org }),
		autumnMetadataId: metadata?.id,
	});

	const session = await createStripeSessionWithCardFallback({
		stripeCli,
		params: fullParams,
	});

	logger.info(
		`Created setup checkout session for ${customer.id ?? customer.internal_id}`,
	);

	if (metadata) {
		await MetadataService.update({
			db: ctx.db,
			id: metadata.id,
			updates: { stripe_checkout_session_id: session.id },
		});
	}

	return { url: session.url };
};
