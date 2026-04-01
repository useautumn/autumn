import {
	CusProductStatus,
	type FullCusProduct,
	type FullSubject,
	FullSubjectSchema,
	type Invoice,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { Redis } from "ioredis";
import { getDbHealth, PgHealth } from "@/db/pgHealthMonitor.js";
import { redis } from "@/external/redis/initRedis.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { resetCustomerEntitlements } from "@/internal/customers/actions/resetCustomerEntitlements/resetCustomerEntitlements.js";
import { tryRedisRead } from "@/utils/cacheUtils/cacheUtils.js";
import { normalizeFromSchema } from "@/utils/cacheUtils/normalizeFromSchema.js";
import { buildFullSubjectCacheKey } from "./fullSubjectCacheConfig.js";

const roundBalance = (value: number | null | undefined): number => {
	if (value === null || value === undefined) return 0;
	return new Decimal(value).toDecimalPlaces(10).toNumber();
};

const roundFullSubjectBalances = (fullSubject: FullSubject): FullSubject => {
	if (!fullSubject.customer_products) return fullSubject;

	for (const cusProduct of fullSubject.customer_products) {
		if (!cusProduct.customer_entitlements) continue;

		for (const cusEnt of cusProduct.customer_entitlements) {
			if (cusEnt.balance !== null && cusEnt.balance !== undefined)
				cusEnt.balance = roundBalance(cusEnt.balance);
			if (cusEnt.adjustment !== null && cusEnt.adjustment !== undefined)
				cusEnt.adjustment = roundBalance(cusEnt.adjustment);
			if (
				cusEnt.additional_balance !== null &&
				cusEnt.additional_balance !== undefined
			)
				cusEnt.additional_balance = roundBalance(cusEnt.additional_balance);

			if (cusEnt.entities && typeof cusEnt.entities === "object") {
				for (const entityId of Object.keys(cusEnt.entities)) {
					const entityData = cusEnt.entities[entityId];
					if (entityData && typeof entityData === "object") {
						if (entityData.balance !== null && entityData.balance !== undefined)
							entityData.balance = roundBalance(entityData.balance);
						if (
							entityData.adjustment !== null &&
							entityData.adjustment !== undefined
						)
							entityData.adjustment = roundBalance(entityData.adjustment);
					}
				}
			}

			if (cusEnt.rollovers && Array.isArray(cusEnt.rollovers)) {
				for (const rollover of cusEnt.rollovers) {
					if (rollover.balance !== null && rollover.balance !== undefined)
						rollover.balance = roundBalance(rollover.balance);
				}
			}
		}
	}

	return fullSubject;
};

const deduplicateInvoices = (fullSubject: FullSubject): Invoice[] => {
	const idToInvoice = new Map<string, Invoice>();
	for (const invoice of fullSubject.invoices ?? []) {
		idToInvoice.set(invoice.id, invoice);
	}

	return Array.from(idToInvoice.values()).sort((a, b) => {
		if (b.created_at !== a.created_at) return b.created_at - a.created_at;
		return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
	});
};

const filterExpiredCustomerProducts = (
	fullSubject: FullSubject,
): FullCusProduct[] => {
	return (
		fullSubject.customer_products?.filter((cusProduct) => {
			return cusProduct.status !== CusProductStatus.Expired;
		}) ?? []
	);
};

/**
 * Get FullSubject from Redis cache. Lazily resets stale entitlements.
 * @returns FullSubject if found, undefined if not in cache
 */
export const getCachedFullSubject = async ({
	ctx,
	customerId,
	entityId,
	redisInstance,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	redisInstance?: Redis;
}): Promise<FullSubject | undefined> => {
	const { org, env } = ctx;
	const cacheKey = buildFullSubjectCacheKey({
		orgId: org.id,
		env,
		customerId,
		entityId,
	});
	const redisClient = redisInstance || redis;

	const cached = await tryRedisRead(
		() => redisClient.call("JSON.GET", cacheKey) as Promise<string | null>,
	);

	if (!cached) return undefined;

	const fullSubject = normalizeFromSchema<FullSubject>({
		schema: FullSubjectSchema,
		data: JSON.parse(cached),
	});

	if (!fullSubject.extra_customer_entitlements) {
		fullSubject.extra_customer_entitlements = [];
	}

	if (fullSubject.subjectType === "customer") {
		fullSubject.invoices = deduplicateInvoices(fullSubject);

		if (!fullSubject.customer.send_email_receipts) {
			fullSubject.customer.send_email_receipts = false;
		}
	}

	fullSubject.customer_products = filterExpiredCustomerProducts(fullSubject);

	if (getDbHealth() !== PgHealth.Degraded) {
		await resetCustomerEntitlements({
			ctx,
			fullCus: {
				...fullSubject.customer,
				customer_products: fullSubject.customer_products,
				extra_customer_entitlements: fullSubject.extra_customer_entitlements,
				entities: [],
			},
		});
	}

	return roundFullSubjectBalances(fullSubject);
};
