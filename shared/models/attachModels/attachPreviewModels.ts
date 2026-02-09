import type { FreeTrial } from "../productModels/freeTrialModels/freeTrialModels.js";
import type { FullProduct } from "../productModels/productModels.js";
import type { UsageModel } from "../productV2Models/productItemModels/productItemModels.js";
import type { AttachBranch } from "./attachEnums/AttachBranch.js";
import type { AttachFunction } from "./attachEnums/AttachFunction.js";

export interface LegacyPreviewLineItem {
	amount?: number | undefined;
	description: string;
	price: string;
	price_id: string;
	usage_model?: UsageModel;
	feature_id?: string;
}

export interface AttachPreview {
	func: AttachFunction;
	branch: AttachBranch;
	options: any;
	new_items: any;
	due_today: {
		line_items: LegacyPreviewLineItem[];
		total: number;
	};
	due_next_cycle: {
		line_items: LegacyPreviewLineItem[];
		due_at: number;
	};
	free_trial?: FreeTrial | null;
	current_product?: FullProduct;
}
