import {
	AffectedResource,
	type AttachParamsV1,
	type BillingResponse,
	type Checkout,
	CheckoutAction,
	CheckoutStatus,
	ErrCode,
	InternalError,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import { fromUnixTime, isFuture } from "date-fns";
import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { toSuccessUrl } from "@/internal/orgs/orgUtils/convertOrgUtils";
import { checkoutActions } from "../actions";

const STRIPE_SESSION_ID_REGEX = /cs_(test|live)_[A-Za-z0-9]+/;

const isLongLivedAttachCheckout = (checkout: Checkout) =>
	checkout.action === CheckoutAction.Attach &&
	"long_lived_checkout" in checkout.params &&
	checkout.params.long_lived_checkout === true;

const getActiveStripeCheckoutUrl = async ({
	ctx,
	url,
}: {
	ctx: AutumnContext;
	url: string | null | undefined;
}) => {
	const sessionId = url?.match(STRIPE_SESSION_ID_REGEX)?.[0];
	if (!sessionId) return null;

	try {
		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const session = await stripeCli.checkout.sessions.retrieve(sessionId);
		return session.status === "open" &&
			isFuture(fromUnixTime(session.expires_at))
			? session.url
			: null;
	} catch (error) {
		if (error instanceof Stripe.errors.StripeError) {
			ctx.logger.warn(`Unable to retrieve checkout session ${sessionId}`);
			return null;
		}
		throw error;
	}
};

const completeCheckoutWithoutPayment = async ({
	ctx,
	checkout,
	response,
}: {
	ctx: AutumnContext;
	checkout: Checkout;
	response: BillingResponse;
}) => {
	await checkoutActions.updateDbAndCache({
		ctx,
		oldCheckout: checkout,
		updates: {
			status: CheckoutStatus.Completed,
			response,
			stripe_invoice_id: response.invoice?.stripe_id ?? null,
			completed_at: Date.now(),
		},
	});
	await invalidateCachedFullSubject({
		ctx,
		customerId: checkout.customer_id,
		entityId: response.entity_id,
		source: "startLongLivedCheckout",
	});
};

export const handleStartLongLivedCheckout = createRoute({
	scopes: [Scopes.Public],
	resource: AffectedResource.Attach,
	lock:
		process.env.NODE_ENV !== "development"
			? {
					ttlMs: 120000,
					errorMessage:
						"Checkout start already in progress for this customer, try again in a few seconds",
					getKey: (c) => {
						const ctx = c.get("ctx");
						const checkout = c.get("checkout") as Checkout;
						return buildBillingLockKey({
							orgId: ctx.org.id,
							env: ctx.env,
							customerId: checkout.customer_id,
						});
					},
				}
			: undefined,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const checkout = c.get("checkout");

		if (!isLongLivedAttachCheckout(checkout)) {
			throw new RecaseError({
				message:
					"Long-lived checkout start only supports long-lived attach checkouts",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const activeUrl = await getActiveStripeCheckoutUrl({
			ctx,
			url: checkout.response?.payment_url,
		});
		if (activeUrl) return c.redirect(activeUrl, StatusCodes.SEE_OTHER);

		const renewedResponse = await checkoutActions.renewLongLivedSession({
			ctx,
			checkout,
		});
		if (renewedResponse?.payment_url) {
			await checkoutActions.updateDbAndCache({
				ctx,
				oldCheckout: checkout,
				updates: { response: renewedResponse },
			});
			return c.redirect(renewedResponse.payment_url, StatusCodes.SEE_OTHER);
		}

		const { billingContext, billingResult } = await billingActions.attach({
			ctx,
			params: {
				...(checkout.params as AttachParamsV1),
				long_lived_checkout: false,
			},
			preview: false,
			skipAutumnCheckout: true,
			longLivedCheckout: { id: checkout.id, expiresAt: checkout.expires_at },
		});

		if (!billingResult) {
			throw new InternalError({
				message: "billingResult not returned from long-lived checkout attach",
			});
		}

		const response = billingResultToResponse({ billingContext, billingResult });
		if (!response.payment_url) {
			await completeCheckoutWithoutPayment({ ctx, checkout, response });
			return c.redirect(
				billingContext.successUrl ??
					toSuccessUrl({ org: ctx.org, env: ctx.env }),
				StatusCodes.SEE_OTHER,
			);
		}

		await checkoutActions.updateDbAndCache({
			ctx,
			oldCheckout: checkout,
			updates: { response },
		});

		return c.redirect(response.payment_url, StatusCodes.SEE_OTHER);
	},
});
