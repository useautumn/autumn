import type { Autumn } from "@sdk";

export interface ProductDetails {
	id?: string;
	name?: string;
	description?: string;
	buttonText?: string;
	buttonUrl?: string;
	recommendText?: string;
	everythingFrom?: string;

	price?: {
		primaryText: string;
		secondaryText?: string;
	};

	items?: {
		featureId?: string;
		primaryText?: string;
		secondaryText?: string;
	}[];
}
export interface ProductWithDisplay extends Autumn.Product {
	display?: {
		name?: string;
		description?: string;
		button_text?: string;
		recommend_text?: string;
		everything_from?: string;
		button_url?: string;
	};
}
