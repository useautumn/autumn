import type { Invoice } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { tryRedisWrite } from "@/utils/cacheUtils/cacheUtils.js";
import { logAlertEvent } from "@/utils/logging/logAlertEvent.js";
import { buildFullSubjectKey } from "../builders/buildFullSubjectKey.js";
import { FULL_SUBJECT_CACHE_TTL_SECONDS } from "../config/fullSubjectCacheConfig.js";

type UpsertInvoiceAction = "appended" | "updated";

type UpsertInvoiceLuaResult = {
	success: boolean;
	action?: UpsertInvoiceAction;
	cache_miss?: boolean;
};

export type UpsertCachedInvoiceV2Result = {
	success: boolean;
	action?: UpsertInvoiceAction;
	cacheMiss?: boolean;
};

const FULL_SUBJECT_INVOICE_UPSERT_SLOW_THRESHOLD_MS = 100;

export const upsertCachedInvoiceV2 = async ({
	ctx,
	customerId,
	invoice,
}: {
	ctx: AutumnContext;
	customerId: string;
	invoice: Invoice;
}): Promise<UpsertCachedInvoiceV2Result | null> => {
	if (!customerId) {
		ctx.logger.warn(
			`[upsertCachedInvoiceV2] Skipping cache update for invoice ${invoice.stripe_id} because customerId is missing`,
		);
		return null;
	}

	const { org, env, logger, redisV2 } = ctx;
	const subjectKey = buildFullSubjectKey({
		orgId: org.id,
		env,
		customerId,
	});
	const invoiceJson = JSON.stringify(invoice);

	const startTime = Date.now();
	const result = await tryRedisWrite(
		async () =>
			await redisV2.upsertInvoiceInFullSubjectV2(
				subjectKey,
				invoiceJson,
				String(FULL_SUBJECT_CACHE_TTL_SECONDS),
				String(Date.now()),
			),
		redisV2,
	);
	const durationMilliseconds = Date.now() - startTime;

	if (durationMilliseconds > FULL_SUBJECT_INVOICE_UPSERT_SLOW_THRESHOLD_MS) {
		logAlertEvent({
			ctx,
			severity: "warning",
			category: "redis",
			alertKey: "redis_full_subject_invoice_upsert_slow",
			message: `FullSubject invoice upsert was slow for ${customerId}`,
			source: "upsertCachedInvoiceV2",
			component: "full_subject_cache",
			data: {
				subject_key: subjectKey,
				duration_ms: durationMilliseconds,
				threshold_ms: FULL_SUBJECT_INVOICE_UPSERT_SLOW_THRESHOLD_MS,
				redis_command: "upsertInvoiceInFullSubjectV2",
				invoice_stripe_id: invoice.stripe_id ?? null,
			},
		});
	}

	if (result === null) {
		logger.warn(
			`[upsertCachedInvoiceV2] Redis write failed for customer ${customerId}, invoice ${invoice.stripe_id}`,
		);
		return null;
	}

	const parsed = JSON.parse(result) as UpsertInvoiceLuaResult;

	return {
		success: parsed.success,
		action: parsed.action,
		cacheMiss: parsed.cache_miss,
	};
};
