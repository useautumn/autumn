import {
	CustomerNotFoundError,
	EntityNotFoundError,
	ErrCode,
	RecaseError,
	type UpdateEntityParams,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { assertEntityUsageLimitAlertsResolvable } from "@/internal/balances/usageAlerts/validate/assertEntityUsageLimitAlertsResolvable.js";
import { getUsageLimitConfigUpdate } from "@/internal/customers/actions/update/getUsageLimitConfigUpdate.js";
import { prepareUsageLimitUsage } from "@/internal/customers/actions/update/prepareUsageLimitUsage.js";
import { updateCachedEntityData } from "@/internal/customers/cache/fullSubject/actions/updateCachedEntityData.js";
import { invalidateCachedFullSubject } from "@/internal/customers/cache/fullSubject/index.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";
import { usageWindowRepo } from "@/internal/customers/usageWindows/repos/index.js";
import { mergeEntityMetadata } from "./mergeEntityMetadata.js";

export const updateEntity = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateEntityParams;
}) => {
	const {
		customer_id: customerId,
		entity_id: entityId,
		billing_controls,
		metadata,
	} = params;
	if (!customerId) {
		throw new RecaseError({
			message: "customer_id is required to update an entity",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const fullSubject = await getFullSubject({
		ctx,
		customerId,
		entityId,
	});

	if (!fullSubject) {
		throw new CustomerNotFoundError({ customerId });
	}

	const entity = fullSubject.entity;

	if (!entity) {
		throw new EntityNotFoundError({ entityId });
	}

	const configUsageLimits = getUsageLimitConfigUpdate({
		usageLimits: billing_controls?.usage_limits,
	});
	const usageWindows = await prepareUsageLimitUsage({
		ctx,
		customerId,
		entityId,
		usageLimits: billing_controls?.usage_limits,
		configUsageLimits,
	});

	assertEntityUsageLimitAlertsResolvable({
		ctx,
		entity,
		fullSubject,
		billingControls: billing_controls
			? { ...billing_controls, usage_limits: configUsageLimits }
			: undefined,
	});

	const nextMetadata =
		metadata == null
			? undefined
			: mergeEntityMetadata({
					existing: entity.metadata,
					incoming: metadata,
				});

	const filteredUpdates = Object.fromEntries(
		Object.entries({
			spend_limits: billing_controls?.spend_limits,
			usage_limits: configUsageLimits,
			usage_alerts: billing_controls?.usage_alerts,
			overage_allowed: billing_controls?.overage_allowed,
			metadata: nextMetadata,
		}).filter(([, value]) => value !== undefined),
	);

	const hasEntityUpdates = Object.keys(filteredUpdates).length > 0;
	if (hasEntityUpdates || usageWindows.length > 0) {
		await ctx.db.transaction(async (tx) => {
			await usageWindowRepo.setWindows({
				db: tx as unknown as DrizzleCli,
				windows: usageWindows,
			});
			if (hasEntityUpdates)
				await EntityService.update({
					db: tx as unknown as DrizzleCli,
					internalId: entity.internal_id,
					update: filteredUpdates,
				});
		});
	}
	if (hasEntityUpdates)
		await updateCachedEntityData({
			ctx,
			customerId,
			entityId,
			updates: filteredUpdates,
		});
	if (usageWindows.length > 0)
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			entityId,
			source: "updateEntity:usage",
		});

	return entity.id ?? entity.internal_id;
};
