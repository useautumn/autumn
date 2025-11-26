import type { FullCustomer } from "@autumn/shared";
import { redis } from "../../../../external/redis/initRedis.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";
import { tryRedisWrite } from "../../../../utils/cacheUtils/cacheUtils.js";
import { InvoiceService } from "../../../invoices/InvoiceService.js";
import { invoicesToResponse } from "../../../invoices/invoiceUtils.js";

/**
 * Set customer invoices cache in Redis with all entities
 * This function updates only the invoices array in the customer cache (customer-level invoices only)
 * and individual entity caches (entity-level invoices only)
 */
export const setCachedApiInvoices = async ({
	ctx,
	fullCus,
	customerId,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	customerId: string;
}) => {
	const { org, env, logger, db } = ctx;

	// Get customer-level invoices (no entity or null entity)
	const invoices = fullCus.invoices
		? fullCus.invoices
		: await InvoiceService.list({
				db,
				internalCustomerId: fullCus.internal_id,
				limit: 10,
			});

	// Filter to only customer-level invoices (exclude entity-specific)
	const customerLevelInvoices = invoices.filter(
		(invoice) => !invoice.internal_entity_id,
	);

	// Build master api customer invoices (customer-level only)
	const masterApiInvoices = invoicesToResponse({
		invoices: customerLevelInvoices,
		logger,
	});

	// Then write to Redis
	await tryRedisWrite(async () => {
		// Update customer invoices
		await redis.setInvoices(
			JSON.stringify(masterApiInvoices),
			org.id,
			env,
			customerId,
		);
		logger.info(
			`Updated customer invoices cache for customer ${customerId} (${masterApiInvoices.length} invoices)`,
		);
	});
};
