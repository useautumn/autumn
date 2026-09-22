import { type BillingVerifyExportRow, withTimeout } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { retryAsync } from "@/utils/retryAsync.js";
import { CusService } from "../../CusService.js";
import type { CustomerExportScalarRow } from "../queries/getCustomerExportScalars.js";
import {
	BILLING_VERIFY_CUSTOMER_ATTEMPTS,
	BILLING_VERIFY_CUSTOMER_TIMEOUT_MS,
	BILLING_VERIFY_RETRY_DELAY_MS,
} from "./billingVerifyExportConfig.js";
import type { BillingVerifySweep } from "./setupBillingVerifySweep.js";
import {
	isVerifyResponseClean,
	verifyResponseToExportRow,
} from "./verifyResponseToExportRows.js";

/** The swept subscriptions only screen; a flagged customer is re-verified live
 * so a sweep gone stale mid-run can never reach the file. A read that never
 * settles is retried on a fresh connection before the customer is failed. */
export const verifyCustomerToExportRows = async ({
	ctx,
	scalar,
	sweep,
	timeoutMs = BILLING_VERIFY_CUSTOMER_TIMEOUT_MS,
	retryDelayMs = BILLING_VERIFY_RETRY_DELAY_MS,
}: {
	ctx: AutumnContext;
	scalar: CustomerExportScalarRow;
	sweep: BillingVerifySweep;
	timeoutMs?: number;
	retryDelayMs?: number;
}): Promise<BillingVerifyExportRow[]> => {
	const stripeCustomerId = scalar.processor?.id;
	if (!stripeCustomerId) return [];

	const customer = {
		customer_id: scalar.id,
		name: scalar.name,
		email: scalar.email,
		stripe_customer_id: stripeCustomerId,
	};

	const verifyOnce = () =>
		withTimeout({
			timeoutMs,
			timeoutMessage: `Verification timed out after ${timeoutMs}ms`,
			fn: async () => {
				const fullCustomer = await CusService.getFull({
					ctx,
					idOrInternalId: scalar.internal_id,
					withEntities: true,
				});
				const params = { customer_id: scalar.id ?? scalar.internal_id };

				const { stripeReader, sweptSubscriptions } = sweep;

				const screened = await billingActions.verify({
					ctx,
					params,
					prefetched: {
						fullCustomer,
						subscriptions: sweptSubscriptions.get(stripeCustomerId) ?? [],
					},
					stripeCli: stripeReader,
				});
				if (isVerifyResponseClean({ response: screened })) return [];

				const confirmed = await billingActions.verify({
					ctx,
					params,
					prefetched: { fullCustomer },
				});
				const row = verifyResponseToExportRow({
					customer,
					response: confirmed,
				});
				return row ? [row] : [];
			},
		});

	try {
		return await retryAsync({
			attempts: BILLING_VERIFY_CUSTOMER_ATTEMPTS,
			delayMs: retryDelayMs,
			run: verifyOnce,
			onRetry: ({ attempt, error }) =>
				ctx.logger.warn("billing-verify-export: retrying customer", {
					data: {
						customerId: scalar.id,
						attempt,
						error: error instanceof Error ? error.message : String(error),
					},
				}),
		});
	} catch (error) {
		return [
			{
				...customer,
				stripe_subscription_ids: null,
				severity: "error",
				issues: "verify_failed",
				details: error instanceof Error ? error.message : String(error),
			},
		];
	}
};
