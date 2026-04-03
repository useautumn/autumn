import type { Invoice, InvoiceLineItem } from "@autumn/shared";
import { AnimatePresence, motion } from "motion/react";
import { SheetContainer } from "@/components/v2/sheets/InlineSheet";
import { SheetCloseButton } from "@/components/v2/sheets/SheetCloseButton";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import {
	useSheetEscapeHandler,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { SubscriptionCancelSheet } from "@/views/customers2/components/sheets/SubscriptionCancelSheet";
import { SubscriptionUncancelSheet } from "@/views/customers2/components/sheets/SubscriptionUncancelSheet";
import { SubscriptionUpdateSheet2 } from "@/views/customers2/components/sheets/SubscriptionUpdateSheet2";
import { AttachProductSheet } from "../components/sheets/AttachProductSheet";
import { AttachProductSheetV2 } from "../components/sheets/AttachProductSheetV2";
import { AttachProductSheetV3 } from "../components/sheets/AttachProductSheetV3";
import { BalanceCreateSheet } from "../components/sheets/BalanceCreateSheet";
import { BalanceDeleteSheet } from "../components/sheets/BalanceDeleteSheet";
import { BalanceEditSheet } from "../components/sheets/BalanceEditSheet";
import { BillingAutoTopupSheet } from "../components/sheets/BillingAutoTopupSheet";
import { BillingOverageAllowedSheet } from "../components/sheets/BillingOverageAllowedSheet";
import { BillingSpendLimitSheet } from "../components/sheets/BillingSpendLimitSheet";
import { BillingUsageAlertSheet } from "../components/sheets/BillingUsageAlertSheet";
import { CheckBalanceSheet } from "../components/sheets/CheckBalanceSheet";
import { InvoiceDetailSheet } from "../components/sheets/InvoiceDetailSheet";
import { RecordUsageSheet } from "../components/sheets/RecordUsageSheet";
import { SubscriptionDetailSheet } from "../components/sheets/SubscriptionDetailSheet";
import { SubscriptionUpdateSheet } from "../components/sheets/SubscriptionUpdateSheet";
import { SHEET_ANIMATION } from "./customerAnimations";

export function CustomerSheets() {
	const isMobile = useIsMobile();
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
				return <AttachProductSheet />;
			case "attach-product-v2":
				return <AttachProductSheetV3 />;
			case "subscription-detail":
				return <SubscriptionDetailSheet />;
			case "subscription-update":
				return <SubscriptionUpdateSheet />;
			case "subscription-update-v2":
				return <SubscriptionUpdateSheet2 />;
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
			case "billing-auto-topup-add":
			case "billing-auto-topup-edit":
				return <BillingAutoTopupSheet />;
			case "billing-spend-limit-add":
			case "billing-spend-limit-edit":
				return <BillingSpendLimitSheet />;
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
			default:
				return null;
		}
	};

	return (
		<AnimatePresence mode="wait">
			{sheetType && (
				<motion.div
					initial={{ x: "100%" }}
					animate={{ x: 0 }}
					exit={{ x: "100%" }}
					transition={SHEET_ANIMATION}
					className="absolute right-0 top-0 bottom-0"
					style={{ width: isMobile ? "100%" : "28rem", zIndex: 45 }}
				>
					<SheetContainer className="w-full bg-card z-40 sm:border-l border-border/40 h-full relative">
						<SheetCloseButton onClose={handleClose} />
						{renderSheet()}
					</SheetContainer>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
