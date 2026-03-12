import { findFeatureById } from "@utils/featureUtils/index.js";
import type { ApiSubjectV0 } from "../../../api/customers/apiSubjectV0.js";
import { apiBalanceV1ToAvailableOverage } from "../../../api/customers/cusFeatures/utils/convert/apiBalanceV1ToAvailableOverage.js";
import { getApiBalance } from "../../../api/customers/cusFeatures/utils/getApiBalance.js";
import type { Entity } from "../../../models/cusModels/entityModels/entityModels.js";
import type { FullCustomer } from "../../../models/cusModels/fullCusModel.js";
import type { SharedContext } from "../../../types/sharedContext.js";
import { orgToInStatuses } from "../../orgUtils/convertOrgUtils.js";
import { fullCustomerToCustomerEntitlements } from "./fullCustomerToCustomerEntitlements.js";

const getApiSubject = ({
	fullCustomer,
	entity,
}: {
	fullCustomer: FullCustomer;
	entity?: Entity;
}): ApiSubjectV0 =>
	entity
		? ({
				billing_controls: {
					spend_limits: entity.spend_limits ?? undefined,
				},
			} as ApiSubjectV0)
		: ({
				billing_controls: {
					spend_limits: fullCustomer.spend_limits ?? undefined,
				},
			} as ApiSubjectV0);

export const fullCustomerToAvailableOverage = ({
	ctx,
	fullCustomer,
	featureIds,
	internalEntityId,
}: {
	ctx: SharedContext;
	fullCustomer: FullCustomer;
	featureIds: string[];
	internalEntityId?: string;
}) => {
	const entity = internalEntityId
		? fullCustomer.entities?.find(
				(candidate) => candidate.internal_id === internalEntityId,
			)
		: fullCustomer.entity;
	const uniqueFeatureIds = [...new Set(featureIds)];

	if (uniqueFeatureIds.length === 0) {
		return {};
	}

	const scopedFullCustomer = entity
		? {
				...fullCustomer,
				entity,
			}
		: fullCustomer;
	const apiSubject = getApiSubject({
		fullCustomer,
		entity,
	});
	const availableOverageByFeatureId: Record<string, number> = {};

	for (const featureId of uniqueFeatureIds) {
		const feature = findFeatureById({
			features: ctx.features,
			featureId,
		});

		if (!feature) continue;

		const customerEntitlements = fullCustomerToCustomerEntitlements({
			fullCustomer,
			featureId,
			entity,
			inStatuses: orgToInStatuses({ org: ctx.org }),
		});

		if (customerEntitlements.length === 0) {
			continue;
		}

		const { data: apiBalance } = getApiBalance({
			ctx,
			fullCus: scopedFullCustomer,
			cusEnts: customerEntitlements,
			feature,
		});

		const availableOverage = apiBalanceV1ToAvailableOverage({
			apiBalance,
			apiSubject,
			feature,
		});

		if (availableOverage === undefined) continue;

		availableOverageByFeatureId[featureId] = availableOverage;
	}

	return availableOverageByFeatureId;
};
