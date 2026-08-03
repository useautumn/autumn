import { AttachScenario, type FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { sendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/sendProductsUpdated.js";
import type { MigrationWebhookRecord } from "../types/migrationWebhookRecord.js";

/** Migration patches keep the customer's plan; the customize path emits
 * `new` for the same shape, so consumers see a consistent scenario. */
const PRODUCTS_UPDATED_SCENARIO = AttachScenario.New;

/** One `customer.products.updated` per customer product the record touched. */
export const sendProductsUpdatedForRecord = async ({
	ctx,
	record,
	fullCustomer,
}: {
	ctx: AutumnContext;
	record: MigrationWebhookRecord;
	fullCustomer: FullCustomer | undefined;
}) => {
	for (const customerProductId of record.customerProductIds) {
		// Expired-since-page products drop out of the prefetch (RELEVANT_STATUSES);
		// sendProductsUpdated falls back to its own direct fetch for those.
		const customerProduct = fullCustomer?.customer_products.find(
			(cusProduct) => cusProduct.id === customerProductId,
		);

		await sendProductsUpdated({
			ctx,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: record.customerId,
				customerProductId,
				scenario: PRODUCTS_UPDATED_SCENARIO,
			},
			// Shallow copy: sendProductsUpdated enriches `.entity` in place, and
			// the prefetched customer is shared across concurrent records.
			preloaded: fullCustomer
				? { fullCustomer: { ...fullCustomer }, customerProduct }
				: undefined,
		});
	}
};
