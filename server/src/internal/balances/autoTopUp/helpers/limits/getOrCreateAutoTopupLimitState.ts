import { InternalError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { generateId } from "@/utils/genUtils.js";
import { autoTopupLimitRepo } from "../../repos";

export const getOrCreateAutoTopupLimitState = async ({
	ctx,
	internalCustomerId,
	customerId,
	featureId,
	now,
}: {
	ctx: AutumnContext;
	internalCustomerId: string;
	customerId: string;
	featureId: string;
	now: number;
}) => {
	const existing = await autoTopupLimitRepo.findByScope({
		ctx,
		internalCustomerId,
		featureId,
	});

	if (existing) return existing;

	const inserted = await autoTopupLimitRepo.insert({
		ctx,
		data: {
			id: generateId("atlim"),
			internal_customer_id: internalCustomerId,
			customer_id: customerId,
			feature_id: featureId,
			purchase_window_ends_at: now,
			purchase_count: 0,
			attempt_window_ends_at: now,
			attempt_count: 0,
			failed_attempt_window_ends_at: now,
			failed_attempt_count: 0,
			updated_at: now,
		},
	});

	if (inserted) return inserted;

	const afterConflict = await autoTopupLimitRepo.findByScope({
		ctx,
		internalCustomerId,
		featureId,
	});

	if (afterConflict) return afterConflict;

	throw new InternalError({
		code: "auto_topup_limits_init_failed",
		message: `Failed to initialize auto_topup_limits for customer ${customerId} and feature ${featureId}`,
	});
};
