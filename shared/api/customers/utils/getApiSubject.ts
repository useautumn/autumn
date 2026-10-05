import type {
	AllocationView,
	ApiCustomerV5,
	ApiEntityV2,
	FullSubject,
	SharedContext,
} from "@autumn/shared";
import { getApiEntityBaseV2 } from "../../entities/utils/getApiEntityBaseV2.js";
import { subjectWithoutEntityData } from "./customerEntityData.js";
import { getApiCustomerBaseV2 } from "./getApiCustomerBaseV2.js";

export const getApiSubject = async ({
	ctx,
	fullSubject,
	includeAggregations,
	allocationView,
}: {
	ctx: SharedContext;
	fullSubject: FullSubject;
	includeAggregations: boolean;
	allocationView?: AllocationView;
}): Promise<ApiCustomerV5 | ApiEntityV2> => {
	if (fullSubject.subjectType === "entity") {
		const { apiEntity } = await getApiEntityBaseV2({
			ctx,
			fullSubject,
		});
		return apiEntity;
	}

	const subjectToUse = includeAggregations
		? fullSubject
		: subjectWithoutEntityData({ fullSubject });

	const { apiCustomer } = await getApiCustomerBaseV2({
		ctx,
		fullSubject: subjectToUse,
		withAutumnId: true,
		allocationView,
	});

	return apiCustomer;
};
