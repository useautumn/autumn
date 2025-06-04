import { FreeTrial } from "../productModels/freeTrialModels/freeTrialModels.js";
import { AttachBranch } from "./attachEnums/AttachBranch.js";

export interface PreviewLineItem {
  amount: number;
  description: string;
  price: string;
}

export interface AttachPreview {
  branch: AttachBranch;
  options: any;
  new_items: any;
  due_today: {
    line_items: PreviewLineItem[];
    total: string;
  };
  due_next_cycle: {
    line_items: PreviewLineItem[];
    due_at: number;
  };
  free_trial?: FreeTrial | null;
}
