import type {
	ApiInvoicePreviewV0,
	Invoice,
	InvoiceLineItem,
} from "@autumn/shared";
import { Sheet, SheetContent } from "@autumn/ui";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { SubscriptionCancelSheet } from "@/views/customers2/components/sheets/SubscriptionCancelSheet";
import { SubscriptionUncancelSheet } from "@/views/customers2/components/sheets/SubscriptionUncancelSheet";
import { SubscriptionUpdateSheet } from "@/views/customers2/components/sheets/SubscriptionUpdateSheet";
import { useCustomerContext } from "@/views/customers2/customer/CustomerContext";
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
import { UpcomingInvoiceSheet } from "../components/sheets/UpcomingInvoiceSheet";
import { SyncStripeSheet } from "../components/sync-stripe/SyncStripeSheet";
import { SyncStripeSheetV2 } from "../components/sync-stripe-v2/SyncStripeSheetV2";
import { VerifyStripeSheet } from "../components/verify-stripe/VerifyStripeSheet";

export function CustomerSheets() {
	const sheetType = useSheetStore((s) => s.type);
	const sheetData = useSheetStore((s) => s.data);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const closeBalanceSheet = useCustomerBalanceSheetStore((s) => s.closeSheet);
	const { isInlineEditorOpen } = useCustomerContext();

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
			case "upcoming-invoice-detail": {
				const preview = sheetData?.preview as ApiInvoicePreviewV0 | undefined;
				if (!preview) return null;
				return <UpcomingInvoiceSheet preview={preview} />;
			}
			case "sync-stripe":
				return <SyncStripeSheet />;
			case "sync-stripe-v2":
				return <SyncStripeSheetV2 />;
			case "verify-stripe":
				return <VerifyStripeSheet />;
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
			case "create-schedule-checkout":
				return <CreateScheduleSheet />;
			default:
				return null;
		}
	};

	return (
		<Sheet
			modal={false}
			onOpenChange={(open, eventDetails) => {
				if (open) return;
				// Escape/click-out belongs to the plan editor while it's open.
				if (isInlineEditorOpen) {
					eventDetails.cancel();
					return;
				}
				handleClose();
			}}
			open={!!sheetType}
		>
			{/* The plan editor is a full takeover launched from the sheet. Opacity
			    only joins the transition list while it's open, so the sheet fades
			    out under the editor but snaps back instantly behind it on close.
			    The list must keep `translate` — that's what drives the slide. */}
			<SheetContent
				className={cn(
					"md:max-w-[32rem]",
					isInlineEditorOpen &&
						"transition-[opacity,transform,translate,scale,rotate] opacity-0 pointer-events-none",
				)}
				// Tooltips/popovers portal out of the sheet, so an invisible sheet can
				// still surface them on hover or focus. inert kills the whole subtree.
				inert={isInlineEditorOpen}
				overlayClassName={cn(
					isInlineEditorOpen && "opacity-0 pointer-events-none",
				)}
			>
				{renderSheet()}
			</SheetContent>
		</Sheet>
	);
}
