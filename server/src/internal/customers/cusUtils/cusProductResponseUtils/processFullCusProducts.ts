import type {
	CusProductResponse,
	Entity,
	Feature,
	Organization,
} from "@autumn/shared";
import { getCusProductResponse } from "./getCusProductResponse.js";

export const processFullCusProducts = async ({
	fullCusProducts,
	subs,
	org,
	entities = [],
	apiVersion,
	features,
}: {
	fullCusProducts: any;
	subs: any;
	org: Organization;
	entities?: Entity[];
	apiVersion: number;
	features: Feature[];
}) => {
	// Process full cus products
	const main = [];
	const addOns = [];
	for (const cusProduct of fullCusProducts) {
		const processed = await getCusProductResponse({
			cusProduct,
			subs,
			org,
			entities,
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

	return {
		main: main as CusProductResponse[],
		addOns: addOns as CusProductResponse[],
	};
};
