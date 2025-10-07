import {
	ACTIVE_STATUSES,
	type APICusProduct,
	ApiVersion,
	type ApiVersionClass,
	type CusProductStatus,
	type Entity,
	type Feature,
	type Organization,
} from "@autumn/shared";
import { getCusProductResponse } from "./getCusProductResponse.js";

const mergeCusProductResponses = ({
	cusProductResponses,
}: {
	cusProductResponses: APICusProduct[];
}) => {
	const getProductKey = (product: APICusProduct) => {
		const status = ACTIVE_STATUSES.includes(product.status as CusProductStatus)
			? "active"
			: product.status;
		return `${product.id}:${status}`;
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

export const processFullCusProducts = async ({
	fullCusProducts,
	subs,
	org,
	entity,
	apiVersion,
	features,
}: {
	fullCusProducts: any;
	subs: any;
	org: Organization;
	entity?: Entity;
	apiVersion: ApiVersionClass;
	features: Feature[];
}) => {
	// Process full cus products
	let main = [];
	let addOns = [];
	for (const cusProduct of fullCusProducts) {
		const processed = await getCusProductResponse({
			cusProduct,
			subs,
			org,
			entity,
			apiVersion,
			features,
		});

		const isAddOn = cusProduct.product.is_add_on;
		if (isAddOn) {
			addOns.push(processed);
		} else {
			main.push(processed);
		}
	}

	if (apiVersion.gte(ApiVersion.V1_1)) {
		main = mergeCusProductResponses({
			cusProductResponses: main as APICusProduct[],
		});
		addOns = mergeCusProductResponses({
			cusProductResponses: addOns as APICusProduct[],
		});
	}

	return {
		main: main,
		addOns: addOns,
	};
};
