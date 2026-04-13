import type { ApiCustomerV5, ApiEntityV2, FullSubject } from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiEntityBaseV2 } from "@/internal/entities/entityUtils/getApiEntityV2/getApiEntityBaseV2.js";
import { getApiCustomerBaseV2 } from "./getApiCustomerBaseV2.js";

const stripAggregations = ({
	fullSubject,
}: {
	fullSubject: FullSubject;
}): FullSubject => {
	return {
		...fullSubject,
		aggregated_customer_products: undefined,
		aggregated_customer_entitlements: undefined,
	};
};

export const getApiSubject = async ({
	ctx,
	fullSubject,
	includeAggregations,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
	includeAggregations: boolean;
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
		: stripAggregations({
				fullSubject,
			});

	const { apiCustomer } = await getApiCustomerBaseV2({
		ctx,
		fullSubject: subjectToUse,
		withAutumnId: true,
	});

	return apiCustomer;
};
