import {
	ACTIVE_STATUSES,
	type ApiCusPlan,
	type CusProductLegacyData,
	type CusProductStatus,
	type FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusPlan } from "./getApiCusPlan.js";

const mergeCusPlanResponses = ({
	cusPlanResponses,
}: {
	cusPlanResponses: ApiCusPlan[];
}) => {
	const getPlanKey = (cp: ApiCusPlan) => {
		const status = ACTIVE_STATUSES.includes(cp.status as CusProductStatus)
			? "active"
			: cp.status;
		return `${cp.plan_id}:${status}`;
	};

	const record: Record<string, any> = {};

	for (const curr of cusPlanResponses) {
		const key = getPlanKey(curr);
		const latest = record[key];

		const currStartedAt = curr.started_at;

		record[key] = {
			...(latest || curr),
			canceled_at: curr.canceled_at
				? curr.canceled_at
				: latest?.canceled_at || null,
			started_at: latest?.started_at
				? Math.min(latest?.started_at, currStartedAt)
				: currStartedAt,
			quantity: (latest?.quantity || 0) + (curr?.quantity || 0),
		};
	}

	return Object.values(record);
};

export const getApiCusPlans = async ({
	ctx,
	fullCus,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
}) => {
	// Process full cus products
	const apiCusPlans: ApiCusPlan[] = [];

	const cusProducts = fullCus.customer_products;

	const legacyData: Record<string, CusProductLegacyData> = {};
	for (const cusProduct of cusProducts) {
		const processed = await getApiCusPlan({
			cusProduct,
			ctx,
			fullCus,
			entities: fullCus.entities,
		});

		apiCusPlans.push(processed.data);
		legacyData[processed.data.plan_id] = processed.legacyData;
	}

	const merged = mergeCusPlanResponses({
		cusPlanResponses: apiCusPlans,
	});

	return {
		apiCusPlans: merged,
		legacyData,
	};
};
