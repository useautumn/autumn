import type {
	CustomerBillingControlsParams,
	PurchaseLimitInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";

export const makeAutoTopupConfig = ({
	threshold = 20,
	quantity = 100,
	enabled = true,
	purchaseLimit,
	invoiceMode,
}: {
	threshold?: number;
	quantity?: number;
	enabled?: boolean;
	purchaseLimit?: { interval: PurchaseLimitInterval; limit: number };
	invoiceMode?: boolean;
} = {}): CustomerBillingControlsParams => ({
	auto_topups: [
		{
			feature_id: TestFeature.Messages,
			enabled,
			threshold,
			quantity,
			...(purchaseLimit ? { purchase_limit: purchaseLimit } : {}),
			...(invoiceMode !== undefined ? { invoice_mode: invoiceMode } : {}),
		},
	],
});
