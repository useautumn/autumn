import { AttachScenario, type FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { sendProductsUpdated } from "@/internal/billing/v2/workflows/sendProductsUpdated/sendProductsUpdated.js";
import type { MigrationWebhookRecord } from "../types/migrationWebhookRecord.js";

const PRODUCTS_UPDATED_SCENARIO = AttachScenario.New;

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
			preloaded: fullCustomer
				? { fullCustomer: { ...fullCustomer }, customerProduct }
				: undefined,
		});
	}
};
