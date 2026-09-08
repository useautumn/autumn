import {
	type ApiEntityBillingControlsParams,
	CustomerNotFoundError,
	EntityNotFoundError,
	ErrCode,
	RecaseError,
	type UpdateEntityParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
import { assertEntityUsageLimitAlertsResolvable } from "@/internal/balances/usageAlerts/validate/assertEntityUsageLimitAlertsResolvable.js";
import { setUsageLimitUsage } from "@/internal/customers/actions/update/setUsageLimitUsage.js";
import { updateCachedEntityData } from "@/internal/customers/cache/fullSubject/actions/updateCachedEntityData.js";
import { getFullSubject } from "@/internal/customers/repos/getFullSubject/getFullSubject.js";

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

	assertEntityUsageLimitAlertsResolvable({
		ctx,
		entity,
		fullSubject,
		billingControls: billing_controls
			? {
					...billing_controls,
					usage_limits: billing_controls.usage_limits?.filter(
						(entry) => "limit" in entry,
					) as ApiEntityBillingControlsParams["usage_limits"],
				}
			: undefined,
	});

	const filteredUpdates = Object.fromEntries(
		Object.entries({
			spend_limits: billing_controls?.spend_limits,
			usage_limits: (() => {
				const entries = billing_controls?.usage_limits;
				if (entries === undefined) return undefined;
				const configEntries = entries
					.filter((entry) => entry.source !== "plan" && "limit" in entry)
					.map(({ usage: _usage, source: _source, ...entry }) => entry);
				return entries.length === 0 || configEntries.length > 0
					? configEntries
					: undefined;
			})(),
			usage_alerts: billing_controls?.usage_alerts,
			overage_allowed: billing_controls?.overage_allowed,
		}).filter(([, value]) => value !== undefined),
	);

	if (Object.keys(filteredUpdates).length > 0) {
		await EntityService.update({
			db: ctx.db,
			internalId: entity.internal_id,
			update: filteredUpdates,
		});

		await updateCachedEntityData({
			ctx,
			customerId,
			entityId,
			updates: filteredUpdates,
		});
	}
	if (billing_controls?.usage_limits) {
		await setUsageLimitUsage({
			ctx,
			customerId,
			entityId: entity.id ?? entity.internal_id,
			usageLimits: billing_controls.usage_limits,
		});
	}

	return entity.id ?? entity.internal_id;
};
