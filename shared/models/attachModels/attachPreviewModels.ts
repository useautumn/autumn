import { FullCusProduct } from "../cusProductModels/cusProductModels.js";
import { FreeTrial } from "../productModels/freeTrialModels/freeTrialModels.js";
import { FullProduct } from "../productModels/productModels.js";
import { UsageModel } from "../productV2Models/productItemModels/productItemModels.js";
import { AttachBranch } from "./attachEnums/AttachBranch.js";
import { AttachFunction } from "./attachEnums/AttachFunction.js";

export interface PreviewLineItem {
  amount?: number | undefined;
  description: string;
  price: string;
  price_id: string;
  usage_model?: UsageModel;
}

export interface AttachPreview {
  func: AttachFunction;
  branch: AttachBranch;
  options: any;
  new_items: any;
  due_today: {
    line_items: PreviewLineItem[];
    total: number;
  };
  due_next_cycle: {
    line_items: PreviewLineItem[];
    due_at: number;
  };
  free_trial?: FreeTrial | null;
  current_product?: FullProduct;
}
