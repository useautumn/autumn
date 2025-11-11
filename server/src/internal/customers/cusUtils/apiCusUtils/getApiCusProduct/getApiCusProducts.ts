import {
	ACTIVE_STATUSES,
	type ApiCusProduct,
	type CusProductLegacyData,
	type CusProductStatus,
	type FullCustomer,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusProduct } from "./getApiCusProduct.js";

const mergeCusProductResponses = ({
	cusProductResponses,
}: {
	cusProductResponses: ApiCusProduct[];
}) => {
	const getProductKey = (product: ApiCusProduct) => {
		const status = ACTIVE_STATUSES.includes(product.status as CusProductStatus)
			? "active"
			: product.status;
		const cancellationStatus = product.canceled_at ? "cancelled" : "active";
		return `${product.id}:${status}:${cancellationStatus}`;
	};

	const record: Record<string, any> = {};

	for (const curr of cusProductResponses) {
		const key = getProductKey(curr);
		const latest = record[key];

		const currStartedAt = curr.started_at;

		record[key] = {
			...(latest || curr),
			version: Math.max(latest?.version || 1, curr?.version || 1),
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

export const getApiCusProducts = async ({
	ctx,
	fullCus,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
}) => {
	// Process full cus products
	const apiCusProducts: ApiCusProduct[] = [];

	// const inStatuses = ctx.org.config.include_past_due
	// 	? [CusProductStatus.Active, CusProductStatus.PastDue]
	// 	: [CusProductStatus.Active];

	// const cusProducts = fullCus.customer_products.filter((cp) =>
	// 	inStatuses.includes(cp.status),
	// );
	const cusProducts = fullCus.customer_products;

	const legacyData: Record<string, CusProductLegacyData> = {};
	for (const cusProduct of cusProducts) {
		const processed = await getApiCusProduct({
			cusProduct,
			ctx,
			fullCus,
			entities: fullCus.entities,
		});

		apiCusProducts.push(processed.data);
		legacyData[processed.data.id] = processed.legacyData;
	}

	const merged = mergeCusProductResponses({
		cusProductResponses: apiCusProducts,
	});

	return {
		apiCusProducts: merged,
		legacyData,
	};
};
