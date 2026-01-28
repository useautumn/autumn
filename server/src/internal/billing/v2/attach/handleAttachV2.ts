import { AttachParamsV0Schema, RecaseError } from "@autumn/shared";
import { logAutumnBillingPlan } from "@/internal/billing/v2/utils/logs/logAutumnBillingPlan";
import { createRoute } from "../../../../honoMiddlewares/routeHandler";
import { executeBillingPlan } from "../execute/executeBillingPlan";
import { evaluateStripeBillingPlan } from "../providers/stripe/actionBuilders/evaluateStripeBillingPlan";
import { logStripeBillingPlan } from "../providers/stripe/logs/logStripeBillingPlan";
import { logStripeBillingResult } from "../providers/stripe/logs/logStripeBillingResult";
import { billingResultToResponse } from "../utils/billingResult/billingResultToResponse";
import { computeAttachPlan } from "./compute/computeAttachPlan";
import { handleAttachV2Errors } from "./errors/handleAttachV2Errors";
import { logAttachContext } from "./logs/logAttachContext";
import { setupAttachBillingContext } from "./setup/setupAttachBillingContext";

export const handleAttachV2 = createRoute({
	body: AttachParamsV0Schema,
	lock:
		process.env.NODE_ENV !== "development"
			? {
					ttlMs: 120000,
					errorMessage:
						"Attach already in progress for this customer, try again in a few seconds",
					getKey: (c) => {
						const ctx = c.get("ctx");
						const body = c.req.valid("json");
						return `lock:attach:${ctx.org.id}:${ctx.env}:${body.customer_id}`;
					},
				}
			: undefined,
	handler: async (c) => {
		const ctx = c.get("ctx");
		const body = c.req.valid("json");

		ctx.logger.info(
			`=============== RUNNING ATTACH V2 FOR ${body.customer_id} ===============`,
		);

		// 1. Setup
		const billingContext = await setupAttachBillingContext({
			ctx,
			params: body,
		});
		logAttachContext({ ctx, billingContext });

		// 2. Compute
		const autumnBillingPlan = computeAttachPlan({
			ctx,
			attachBillingContext: billingContext,
		});

		logAutumnBillingPlan({ ctx, plan: autumnBillingPlan, billingContext });

		// 3. Errors
		handleAttachV2Errors({
			ctx,
			billingContext,
			autumnBillingPlan,
			params: body,
		});

		// 4. Handle checkout mode (redirect to Stripe checkout)
		if (billingContext.checkoutMode !== null) {
			throw new RecaseError({
				message: `Checkout flow not yet implemented for attach v2 (checkoutMode: ${billingContext.checkoutMode}). Please add a payment method to the customer first.`,
				statusCode: 400,
			});
		}

		// 5. Evaluate Stripe billing plan
		const stripeBillingPlan = await evaluateStripeBillingPlan({
			ctx,
			billingContext,
			autumnBillingPlan,
		});

		logStripeBillingPlan({ ctx, stripeBillingPlan, billingContext });

		// 6. Execute billing plan
		const billingResult = await executeBillingPlan({
			ctx,
			billingContext,
			billingPlan: {
				autumn: autumnBillingPlan,
				stripe: stripeBillingPlan,
			},
		});

		logStripeBillingResult({ ctx, result: billingResult.stripe });

		// 7. Format response
		const response = billingResultToResponse({
			billingContext,
			billingResult,
		});

		return c.json(response, 200);
	},
});
