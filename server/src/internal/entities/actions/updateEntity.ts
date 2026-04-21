import {
	CustomerNotFoundError,
	EntityNotFoundError,
	type UpdateEntityParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { EntityService } from "@/internal/api/entities/EntityService.js";
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
		throw new CustomerNotFoundError({ customerId: "" });
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

	const filteredUpdates = Object.fromEntries(
		Object.entries({
			spend_limits: billing_controls?.spend_limits,
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

	return entity.id ?? entity.internal_id;
};
