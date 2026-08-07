import {
	ErrCode,
	notNullish,
	RecaseError,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrSetCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject.js";
import { isAsyncBalanceUpdateEnabled } from "@/internal/misc/asyncBalanceUpdate/asyncBalanceUpdateStore.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getAsyncTrackProducerQueueUrl } from "@/queue/trackAsyncQueueUrls.js";
import { buildCustomerEntitlementFilters } from "../../utils/buildCustomerEntitlementFilters.js";
import { updateExpiresAtV2 } from "./updateExpiresAtV2.js";
import { updateIncludedGrantV2 } from "./updateIncludedGrantV2.js";
import { updateNextResetAtV2 } from "./updateNextResetAtV2.js";
import { updateRemainingV2 } from "./updateRemainingV2.js";
import { updateUsageV2 } from "./updateUsageV2.js";

const ASYNC_UPDATE_BALANCE_UNAVAILABLE_MESSAGE =
	"Async balance update is not available right now";

/** Update balance using the FullSubject cache path. */
export const runUpdateBalanceV2 = async ({
	ctx,
	params,
	targetBalance,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
}) => {
	const fullSubject = await getOrSetCachedFullSubject({
		ctx,
		customerId: params.customer_id,
		entityId: params.entity_id,
		source: "handleUpdateBalance",
	});

	if (notNullish(params.add_to_balance) || notNullish(targetBalance)) {
		await updateRemainingV2({ ctx, fullSubject, params });
	}

	if (notNullish(params.usage)) {
		await updateUsageV2({ ctx, fullSubject, params });
	}

	if (notNullish(params.included_grant)) {
		ctx.logger.info(
			`updating granted balance for feature ${params.feature_id} to ${params.included_grant}`,
		);

		const customerEntitlementFilters = buildCustomerEntitlementFilters({
			params,
		});

		await updateIncludedGrantV2({
			ctx,
			fullSubject,
			featureId: params.feature_id,
			targetGrantedBalance: params.included_grant,
			customerEntitlementFilters,
		});
	}

	if (notNullish(params.next_reset_at)) {
		const customerEntitlementFilters = buildCustomerEntitlementFilters({
			params,
		});

		await updateNextResetAtV2({
			ctx,
			fullSubject,
			featureId: params.feature_id,
			nextResetAt: params.next_reset_at,
			customerEntitlementFilters,
		});
	}

	if (notNullish(params.expires_at)) {
		const customerEntitlementFilters = buildCustomerEntitlementFilters({
			params,
		});

		await updateExpiresAtV2({
			ctx,
			fullSubject,
			featureId: params.feature_id,
			expiresAt: params.expires_at,
			customerEntitlementFilters,
		});
	}
};

const queueUpdateBalanceV2 = async ({
	ctx,
	params,
	targetBalance,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
}) => {
	const queueUrl = getAsyncTrackProducerQueueUrl();
	if (!queueUrl) {
		throw new RecaseError({
			message: ASYNC_UPDATE_BALANCE_UNAVAILABLE_MESSAGE,
			code: ErrCode.InternalError,
			statusCode: 503,
		});
	}

	try {
		await addTaskToQueue({
			jobName: JobName.UpdateBalance,
			queueUrl,
			messageGroupId: `${ctx.org.id}:${ctx.env}:${params.customer_id}:${params.entity_id ?? "none"}`,
			messageDeduplicationId: ctx.id,
			payload: {
				orgId: ctx.org.id,
				env: ctx.env,
				customerId: params.customer_id,
				entityId: params.entity_id,
				requestId: ctx.id,
				params,
				targetBalance,
			},
		});
		// The worker owns invalidation; route refresh could flush pre-job cache state.
		ctx.testOptions = { ...ctx.testOptions, skipCacheDeletion: true };
	} catch (error) {
		ctx.logger.error("[updateBalanceV2] Failed to enqueue async update", {
			error,
		});
		throw new RecaseError({
			message: ASYNC_UPDATE_BALANCE_UNAVAILABLE_MESSAGE,
			code: ErrCode.InternalError,
			statusCode: 503,
		});
	}
};

export const updateBalanceV2 = async ({
	ctx,
	params,
	targetBalance,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
	targetBalance?: number;
}) => {
	const asyncBalanceUpdateEnabled =
		isAsyncBalanceUpdateEnabled({
			orgId: ctx.org.id,
			orgSlug: ctx.org.slug,
		}) ||
		(process.env.NODE_ENV !== "production" &&
			ctx.testOptions?.asyncBalanceUpdate);

	if (asyncBalanceUpdateEnabled) {
		return queueUpdateBalanceV2({ ctx, params, targetBalance });
	}

	return runUpdateBalanceV2({ ctx, params, targetBalance });
};
