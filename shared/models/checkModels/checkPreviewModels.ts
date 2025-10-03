import type { APIProduct } from "@api/products/apiProduct.js";
import type { Infinite } from "../productModels/productEnums.js";
import type { UsageModel } from "../productV2Models/productItemModels/productItemModels.js";

export enum AttachScenario {
	Scheduled = "scheduled",
	Active = "active",
	New = "new",
	Renew = "renew",
	Upgrade = "upgrade",
	Downgrade = "downgrade",
	Cancel = "cancel",
	Expired = "expired",
}

export interface PreviewItem {
	price: string;
	description: string;
	usage_model?: UsageModel;
	amount?: number;
}

export interface CheckProductPreview {
	// title: string;
	// message: string;
	scenario: AttachScenario;
	product_id: string;
	product_name: string;
	recurring: boolean;
	error_on_attach?: boolean;
	next_cycle_at?: number;
	current_product_name?: string;

	items?: {
		price: string;
		description: string;
		usage_model?: UsageModel;
	}[];

	options?: {
		feature_id: string;
		feature_name: string;
		billing_units: number;
		included_usage: number;
		price?: number;
		tiers?: {
			to: number | typeof Infinite;
			amount: number;
		}[];
	}[];

	due_today?: {
		price: number;
		currency: string;
	};

	due_next_cycle?: {
		price: number;
		currency: string;
	};

	product?: APIProduct;
	payment_method?: any;
}

export enum FeaturePreviewScenario {
	UsageLimit = "usage_limit",
	FeatureFlag = "feature_flag",
}

export interface CheckFeaturePreview {
	title: string;
	message: string;

	scenario: FeaturePreviewScenario;
	feature_id: string;
	feature_name: string;

	products: APIProduct[];
}
