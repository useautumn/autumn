import { InternalError } from "@api/errors/base/InternalError.js";
import type { Entity } from "@models/cusModels/entityModels/entityModels.js";
import type { FullCustomer } from "@models/cusModels/fullCusModel.js";

type FullCustomerWithEntity = FullCustomer & { entity: Entity };

// Overload: errorOnNotFound = true → guaranteed entity
export function enrichFullCustomerWithEntity(params: {
	fullCustomer: FullCustomer;
	internalEntityId: string | null;
	errorOnNotFound: true;
}): FullCustomerWithEntity;

// Overload: errorOnNotFound = false/undefined → entity may be undefined
export function enrichFullCustomerWithEntity(params: {
	fullCustomer: FullCustomer;
	internalEntityId: string | null;
	errorOnNotFound?: false;
}): FullCustomer;

// Implementation
export function enrichFullCustomerWithEntity({
	fullCustomer,
	internalEntityId,
	errorOnNotFound,
}: {
	fullCustomer: FullCustomer;
	internalEntityId: string | null;
	errorOnNotFound?: boolean;
}): FullCustomer | FullCustomerWithEntity {
	if (internalEntityId === null) {
		fullCustomer.entity = undefined;
	} else {
		fullCustomer.entity = fullCustomer.entities?.find(
			(e) => e.internal_id === internalEntityId,
		);
	}

	if (errorOnNotFound && !fullCustomer.entity) {
		throw new InternalError({
			message: `Entity not found for internal_id: ${internalEntityId}`,
		});
	}

	return fullCustomer;
}
