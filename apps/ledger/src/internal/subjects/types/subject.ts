import type {
	FullCusEntWithFullCusProduct,
	FullCusProduct,
} from "@autumn/shared";

// One customer's resident state, as a command reads it: the products that are
// live and the balance rows of the features it named.
export type Subject = {
	customer: { internal_id: string };
	customerProducts: FullCusProduct[];
	customerEntitlements: FullCusEntWithFullCusProduct[];
};
