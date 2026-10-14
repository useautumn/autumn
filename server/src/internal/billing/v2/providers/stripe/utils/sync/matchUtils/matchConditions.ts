export type PriceMatchCondition =
	| { type: "stripe_price_id"; stripe_price_id: string }
	| { type: "stripe_product_id"; stripe_product_id: string }
	| {
			type: "stripe_base_price_shape";
			stripe_product_id: string;
			stripe_price_id: string;
			currency?: string | null;
	  }
	| {
			type: "stripe_prepaid_price_shape";
			stripe_product_id: string;
			stripe_price_id: string;
	  };

export type ProductMatchCondition = {
	type: "stripe_product_id";
	stripe_product_id: string;
};
