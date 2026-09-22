import type { BillingVerifyExportRow } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import { CusService } from "../../CusService.js";
import type { CustomerExportScalarRow } from "../queries/getCustomerExportScalars.js";
import type { BillingVerifySweep } from "./setupBillingVerifySweep.js";
import {
	isVerifyResponseClean,
	verifyResponseToExportRow,
} from "./verifyResponseToExportRows.js";

/** The swept subscriptions only screen; a flagged customer is re-verified live
 * so a sweep gone stale mid-run can never reach the file. */
export const verifyCustomerToExportRows = async ({
	ctx,
	scalar,
	sweep,
}: {
	ctx: AutumnContext;
	scalar: CustomerExportScalarRow;
	sweep: BillingVerifySweep;
}): Promise<BillingVerifyExportRow[]> => {
	const stripeCustomerId = scalar.processor?.id;
	if (!stripeCustomerId) return [];

	const customer = {
		customer_id: scalar.id,
		name: scalar.name,
		email: scalar.email,
		stripe_customer_id: stripeCustomerId,
	};

	try {
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
		const row = verifyResponseToExportRow({ customer, response: confirmed });
		return row ? [row] : [];
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
