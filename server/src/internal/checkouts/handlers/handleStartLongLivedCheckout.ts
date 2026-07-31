import {
	AffectedResource,
	type AttachParamsV1,
	type BillingResponse,
	type Checkout,
	CheckoutAction,
	CheckoutCompletedError,
	CheckoutExpiredError,
	CheckoutStatus,
	CheckoutUnavailableError,
	type CreateScheduleParamsV0,
	customerProducts,
	type DeferredAutumnBillingPlanData,
	ErrCode,
	InternalError,
	MetadataType,
	RecaseError,
	Scopes,
	type StripeBillingPlanResult,
} from "@autumn/shared";
import { fromUnixTime, isFuture } from "date-fns";
import { and, eq, inArray } from "drizzle-orm";
import { StatusCodes } from "http-status-codes";
import Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { createRoute } from "@/honoMiddlewares/routeHandler";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { executeStripeCheckoutSessionAction } from "@/internal/billing/v2/providers/stripe/execute/executeStripeCheckoutSessionAction";
import { discardStripeCheckoutSession } from "@/internal/billing/v2/providers/stripe/utils/checkoutSessions/discardStripeCheckoutSession";
import { buildBillingLockKey } from "@/internal/billing/v2/utils/billingLock/buildBillingLockKey";
import { billingResultToResponse } from "@/internal/billing/v2/utils/billingResult/billingResultToResponse";
import { checkoutRepo } from "@/internal/checkouts";
import { MetadataService } from "@/internal/metadata/MetadataService";
import { getMetadataFromCheckoutSession } from "@/internal/metadata/metadataUtils";
import { checkoutActions } from "../actions";

const STRIPE_SESSION_ID_REGEX = /cs_(test|live)_[A-Za-z0-9]+/;

const isLongLivedCheckout = (checkout: Checkout) =>
	"long_lived_checkout" in checkout.params &&
	checkout.params.long_lived_checkout === true;

const getStripeCheckoutSession = async ({
	ctx,
	url,
}: {
	ctx: AutumnContext;
	url: string | null | undefined;
}): Promise<Stripe.Checkout.Session | null> => {
	const sessionId = url?.match(STRIPE_SESSION_ID_REGEX)?.[0];
	if (!sessionId) return null;

	try {
		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		return await stripeCli.checkout.sessions.retrieve(sessionId);
	} catch (error) {
		if (error instanceof Stripe.errors.StripeError) {
			ctx.logger.warn(`Unable to retrieve checkout session ${sessionId}`);
			return null;
		}
		throw error;
	}
};

const rotateEnabledCheckoutSession = async ({
	ctx,
	checkout,
	session,
}: {
	ctx: AutumnContext;
	checkout: Checkout;
	session: Stripe.Checkout.Session;
}): Promise<BillingResponse | null> => {
	const metadata = await getMetadataFromCheckoutSession(session, ctx.db);
	if (
		metadata?.type === MetadataType.CheckoutSessionEnabledImmediatelyProcessing
	) {
		throw new RecaseError({
			message: "Checkout rotation already in progress",
			code: ErrCode.LockAlreadyExists,
			statusCode: StatusCodes.LOCKED,
		});
	}
	if (metadata?.type !== MetadataType.CheckoutSessionEnabledImmediately) {
		return null;
	}

	const deferredData = metadata.data as DeferredAutumnBillingPlanData;
	if (deferredData.billingContext.longLivedCheckoutId !== checkout.id) {
		return null;
	}

	const checkoutSessionAction =
		deferredData.billingPlan.stripe.checkoutSessionAction;
	if (!checkoutSessionAction) return null;

	const claimed = await MetadataService.claim({
		db: ctx.db,
		id: metadata.id,
		fromType: MetadataType.CheckoutSessionEnabledImmediately,
		toType: MetadataType.CheckoutSessionEnabledImmediatelyProcessing,
	});
	if (!claimed) {
		throw new RecaseError({
			message: "Checkout rotation already in progress",
			code: ErrCode.LockAlreadyExists,
			statusCode: StatusCodes.LOCKED,
		});
	}

	let replacementSession: StripeBillingPlanResult["stripeCheckoutSession"];
	try {
		const stripeResult = await executeStripeCheckoutSessionAction({
			ctx,
			billingPlan: deferredData.billingPlan,
			billingContext: deferredData.billingContext,
			checkoutSessionAction,
		});
		replacementSession = stripeResult.stripeCheckoutSession;
		if (!replacementSession) {
			throw new InternalError({
				message: "Long-lived checkout did not create a replacement session",
			});
		}
		const activeReplacementSession = replacementSession;

		const response = billingResultToResponse({
			billingContext: deferredData.billingContext,
			billingResult: { stripe: stripeResult },
		});
		const customerProductIds =
			deferredData.billingPlan.autumn.insertCustomerProducts.map(
				(customerProduct) => customerProduct.id,
			);

		await ctx.db.transaction(async (tx) => {
			const txDb = tx as unknown as DrizzleCli;
			const reboundProducts = await txDb
				.update(customerProducts)
				.set({ stripe_checkout_session_id: activeReplacementSession.id })
				.where(
					and(
						inArray(customerProducts.id, customerProductIds),
						eq(customerProducts.stripe_checkout_session_id, session.id),
					),
				)
				.returning({ id: customerProducts.id });
			if (reboundProducts.length !== customerProductIds.length) {
				throw new InternalError({
					message: "Long-lived checkout products changed during rotation",
				});
			}

			await MetadataService.delete({ db: txDb, id: metadata.id });
			const updatedCheckout = await checkoutRepo.update({
				db: txDb,
				id: checkout.id,
				updates: { response },
			});
			if (!updatedCheckout) {
				throw new InternalError({
					message: `Checkout ${checkout.id} disappeared during rotation`,
				});
			}
		});

		return response;
	} catch (error) {
		let canRetry = !replacementSession;
		if (replacementSession) {
			canRetry = await discardStripeCheckoutSession({
				ctx,
				session: replacementSession,
			})
				.then(() => true)
				.catch((cleanupError) => {
					ctx.logger.error(
						`Failed to discard replacement checkout session: ${cleanupError}`,
					);
					return false;
				});
		}
		if (canRetry) {
			await MetadataService.claim({
				db: ctx.db,
				id: metadata.id,
				fromType: MetadataType.CheckoutSessionEnabledImmediatelyProcessing,
				toType: MetadataType.CheckoutSessionEnabledImmediately,
			});
		}
		throw error;
	}
};

const startCheckout = async ({
	ctx,
	checkout,
}: {
	ctx: AutumnContext;
	checkout: Checkout;
}): Promise<BillingResponse> => {
	if (checkout.action === CheckoutAction.Attach) {
		const { billingContext, billingResult } = await billingActions.attach({
			ctx,
			params: {
				...(checkout.params as AttachParamsV1),
				long_lived_checkout: false,
			},
			preview: false,
			skipAutumnCheckout: true,
			longLivedCheckoutId: checkout.id,
		});

		if (!billingResult) {
			throw new InternalError({
				message: "Long-lived checkout attach did not return a billing result",
			});
		}

		return billingResultToResponse({ billingContext, billingResult });
	}

	if (checkout.action === CheckoutAction.CreateSchedule) {
		const result = await billingActions.createSchedule({
			ctx,
			params: {
				...(checkout.params as CreateScheduleParamsV0),
				long_lived_checkout: false,
			},
			skipAutumnCheckout: true,
			longLivedCheckoutId: checkout.id,
		});

		return {
			customer_id: result.customer_id,
			entity_id: result.entity_id ?? undefined,
			invoice: result.invoice,
			payment_url: result.payment_url,
			required_action: result.required_action,
		};
	}

	throw new RecaseError({
		message: "Unsupported long-lived checkout action",
		code: ErrCode.InvalidRequest,
		statusCode: StatusCodes.BAD_REQUEST,
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
		const cachedCheckout = c.get("checkout");
		const checkout = await checkoutRepo.get({
			db: ctx.db,
			id: cachedCheckout.id,
		});

		if (!checkout) throw new CheckoutUnavailableError();
		if (checkout.status === CheckoutStatus.Completed) {
			throw new CheckoutCompletedError();
		}
		if (
			checkout.status === CheckoutStatus.Expired ||
			checkout.expires_at < Date.now()
		) {
			throw new CheckoutExpiredError();
		}

		if (!isLongLivedCheckout(checkout)) {
			throw new RecaseError({
				message: "Checkout is not long-lived",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		const session = await getStripeCheckoutSession({
			ctx,
			url: checkout.response?.payment_url,
		});
		if (
			session?.status === "open" &&
			isFuture(fromUnixTime(session.expires_at)) &&
			session.url
		) {
			return c.redirect(session.url, StatusCodes.SEE_OTHER);
		}

		const response =
			(session &&
				(await rotateEnabledCheckoutSession({ ctx, checkout, session }))) ||
			(await startCheckout({ ctx, checkout }));

		if (!response.payment_url) {
			throw new InternalError({
				message: "Long-lived checkout did not return a payment URL",
			});
		}

		await checkoutActions.updateDbAndCache({
			ctx,
			oldCheckout: checkout,
			updates: { response },
		});

		return c.redirect(response.payment_url, StatusCodes.SEE_OTHER);
	},
});
