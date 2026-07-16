import type { Invoice, InvoiceLineItem } from "@autumn/shared";
import { InlineSheetPanel } from "@/components/v2/sheets/InlineSheetPanel";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import {
	useSheetEscapeHandler,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { SubscriptionCancelSheet } from "@/views/customers2/components/sheets/SubscriptionCancelSheet";
import { SubscriptionUncancelSheet } from "@/views/customers2/components/sheets/SubscriptionUncancelSheet";
import { SubscriptionUpdateSheet } from "@/views/customers2/components/sheets/SubscriptionUpdateSheet";
import { AttachProductSheet } from "../components/sheets/AttachProductSheet";

import { BalanceCreateSheet } from "../components/sheets/BalanceCreateSheet";
import { BalanceDeleteSheet } from "../components/sheets/BalanceDeleteSheet";
import { BalanceEditSheet } from "../components/sheets/BalanceEditSheet";
import { BillingAutoTopupSheet } from "../components/sheets/BillingAutoTopupSheet";
import { BillingOverageAllowedSheet } from "../components/sheets/BillingOverageAllowedSheet";
import { BillingSpendLimitSheet } from "../components/sheets/BillingSpendLimitSheet";
import { BillingUsageAlertSheet } from "../components/sheets/BillingUsageAlertSheet";
import { BillingUsageLimitSheet } from "../components/sheets/BillingUsageLimitSheet";
import { CheckBalanceSheet } from "../components/sheets/CheckBalanceSheet";
import { CreateScheduleSheet } from "../components/sheets/CreateScheduleSheet";
import { CustomerConfigSheet } from "../components/sheets/CustomerConfigSheet";
import { InvoiceDetailSheet } from "../components/sheets/InvoiceDetailSheet";
import { LicenseDetailSheet } from "../components/sheets/LicenseDetailSheet";
import { LicensePoolDetailSheet } from "../components/sheets/LicensePoolDetailSheet";
import { RecordUsageSheet } from "../components/sheets/RecordUsageSheet";
import { SubscriptionDetailSheet } from "../components/sheets/SubscriptionDetailSheet";
import { SyncStripeSheet } from "../components/sync-stripe/SyncStripeSheet";
import { SyncStripeSheetV2 } from "../components/sync-stripe-v2/SyncStripeSheetV2";

export function CustomerSheets() {
	const sheetType = useSheetStore((s) => s.type);
	const sheetData = useSheetStore((s) => s.data);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const closeBalanceSheet = useCustomerBalanceSheetStore((s) => s.closeSheet);
	useSheetEscapeHandler();

	const handleClose = () => {
		closeSheet();
		closeBalanceSheet();
	};

	const renderSheet = () => {
		switch (sheetType) {
			case "attach-product":
			case "attach-review":
			case "attach-send-invoice":
			case "attach-checkout-session":
			case "attach-schedule-plan":
				return <AttachProductSheet />;
			// case "attach-product-v2":
			// 	return <AttachProductSheetV3 />;
			case "subscription-detail":
				return <SubscriptionDetailSheet />;
			case "license-detail":
				return <LicenseDetailSheet />;
			case "license-pool-detail":
				return <LicensePoolDetailSheet />;
			case "subscription-update":
			case "subscription-update-send-invoice":
				return <SubscriptionUpdateSheet />;
			case "subscription-cancel":
				return <SubscriptionCancelSheet />;
			case "subscription-uncancel":
				return <SubscriptionUncancelSheet />;
			case "balance-edit":
				return <BalanceEditSheet />;
			case "balance-delete":
				return <BalanceDeleteSheet />;
			case "balance-create":
				return <BalanceCreateSheet />;
			case "invoice-detail": {
				const invoice = sheetData?.invoice as Invoice | undefined;
				const lineItems = (sheetData?.lineItems as InvoiceLineItem[]) ?? [];
				if (!invoice) return null;
				return <InvoiceDetailSheet invoice={invoice} lineItems={lineItems} />;
			}
			case "sync-stripe":
				return <SyncStripeSheet />;
			case "sync-stripe-v2":
				return <SyncStripeSheetV2 />;
			case "customer-config-edit":
				return <CustomerConfigSheet />;
			case "billing-auto-topup-add":
			case "billing-auto-topup-edit":
				return <BillingAutoTopupSheet />;
			case "billing-spend-limit-add":
			case "billing-spend-limit-edit":
				return <BillingSpendLimitSheet />;
			case "billing-usage-limit-add":
			case "billing-usage-limit-edit":
				return <BillingUsageLimitSheet />;
			case "billing-usage-alert-add":
			case "billing-usage-alert-edit":
				return <BillingUsageAlertSheet />;
			case "billing-overage-allowed-add":
			case "billing-overage-allowed-edit":
				return <BillingOverageAllowedSheet />;
			case "record-usage":
				return <RecordUsageSheet />;
			case "check-balance":
				return <CheckBalanceSheet />;
			case "create-schedule":
			case "create-schedule-review":
			case "create-schedule-send-invoice":
				return <CreateScheduleSheet />;
			default:
				return null;
		}
	};

	return (
		<InlineSheetPanel isOpen={!!sheetType} onClose={handleClose}>
			{renderSheet()}
		</InlineSheetPanel>
	);
}
