import type { Invoice } from "@autumn/shared";

import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullCustomerCacheKey } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/fullCustomerCacheConfig.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";

type UpsertInvoiceAction = "appended" | "updated";

type UpsertInvoiceResult = {
	success: boolean;
	action?: UpsertInvoiceAction;
	cacheMiss?: boolean;
};

/**
 * Upsert an invoice in the customer's invoices array in the Redis cache.
 * Matches by stripe_id — replaces if found, appends if not. CRDT-safe.
 */
export const upsertInvoiceInCache = async ({
	ctx,
	customerId,
	invoice,
}: {
	ctx: AutumnContext;
	customerId: string;
	invoice: Invoice;
}): Promise<UpsertInvoiceResult | null> => {
	const { org, env, logger } = ctx;

	try {
		if (!customerId) {
			logger.warn(
				`[upsertInvoiceInCache] Skipping cache update for invoice ${invoice.stripe_id} because customerId is missing`,
			);
			return null;
		}

		const cacheKey = buildFullCustomerCacheKey({
			orgId: org.id,
			env,
			customerId,
		});

		const invoiceJson = JSON.stringify(invoice);

		const result = await tryRedisWrite(async () => {
			return await ctx.redis.upsertInvoiceInCustomer(cacheKey, invoiceJson);
		});

		if (result === null) {
			logger.warn(
				`[upsertInvoiceInCache] Redis write failed for customer ${customerId}, invoice ${invoice.stripe_id}`,
			);
			return null;
		}

		const parsed = JSON.parse(result) as {
			success: boolean;
			action?: UpsertInvoiceAction;
			cache_miss?: boolean;
		};

		logger.info(
			`[upsertInvoiceInCache] customer: ${customerId}, stripe_id: ${invoice.stripe_id}, action: ${parsed.action ?? "none"}${parsed.cache_miss ? ", cache_miss" : ""}`,
		);

		return {
			success: parsed.success,
			action: parsed.action,
			cacheMiss: parsed.cache_miss,
		};
	} catch (error) {
		logger.error(
			`[upsertInvoiceInCache] Error upserting invoice ${invoice.stripe_id} for customer ${customerId}`,
			error,
		);
		return null;
	}
};
