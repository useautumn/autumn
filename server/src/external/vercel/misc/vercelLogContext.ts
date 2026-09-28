import { AuthType } from "@autumn/shared";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { computeRolloutSnapshot } from "@/internal/misc/rollouts/rolloutUtils.js";
import { isFullSubjectRolloutEnabled } from "@/internal/misc/rollouts/fullSubjectRolloutUtils.js";
import {
	addAppContextToLogs,
	addVercelEventToLogs,
} from "@/utils/logging/addContextToLogs";
import type { LogVercelEventContext } from "@/utils/logging/loggerTypes.js";

export const buildVercelEventContext = (
	event: Record<string, any>,
): LogVercelEventContext => {
	const payload = event?.payload ?? {};
	const resource = payload?.resource ?? event?.resource;

	return {
		id: event?.id,
		type: event?.type,
		installation_id:
			payload?.installationId ??
			event?.installation_id ??
			event?.installationId ??
			undefined,
		invoice_id: payload?.invoiceId,
		external_invoice_id: payload?.externalInvoiceId,
		resource_id:
			payload?.resourceId ?? resource?.id ?? event?.resourceId ?? undefined,
	};
};

export const enrichVercelAppLogger = ({
	ctx,
}: {
	ctx: AutumnContext;
}) => {
	const customerId = ctx.customerId;
	const fullSubjectBucket =
		customerId && ctx.rolloutSnapshot?.customerBucket !== undefined
			? (ctx.rolloutSnapshot.customerBucket ?? undefined)
			: undefined;

	return addAppContextToLogs({
		logger: ctx.logger,
		appContext: {
			org_id: ctx.org?.id,
			org_slug: ctx.org?.slug,
			env: ctx.env,
			auth_type: AuthType.Vercel,
			customer_id: customerId,
			entity_id: ctx.entityId,
			api_version: ctx.apiVersion?.semver,
			scopes: ctx.scopes,
			full_subject_bucket: fullSubjectBucket,
			full_subject_rollout_enabled: customerId
				? isFullSubjectRolloutEnabled({ ctx })
				: undefined,
		},
	});
};

export const enrichVercelEventLogger = ({
	ctx,
	vercelEventContext,
}: {
	ctx: AutumnContext;
	vercelEventContext: LogVercelEventContext;
}) => {
	return addVercelEventToLogs({
		logger: ctx.logger,
		vercelEventContext,
	});
};

export const addVercelCustomerToContext = async ({
	ctx,
	vercelInstallationId,
}: {
	ctx: AutumnContext;
	vercelInstallationId: string;
}): Promise<AutumnContext> => {
	const customer = await CusService.getByVercelId({
		ctx,
		vercelInstallationId,
	});

	const customerId = customer?.id || customer?.internal_id || undefined;
	const nextCtx = {
		...ctx,
		fullCustomer: customer ?? undefined,
		...(customerId
			? {
					customerId,
					rolloutSnapshot: computeRolloutSnapshot({
						orgId: ctx.org?.id,
						customerId,
					}),
				}
			: {}),
	};

	const routedCtx = customerId
		? getCtxWithCustomerRedis({ ctx: nextCtx, customerId }).ctx
		: nextCtx;

	return {
		...routedCtx,
		logger: enrichVercelAppLogger({ ctx: routedCtx }),
	};
};
