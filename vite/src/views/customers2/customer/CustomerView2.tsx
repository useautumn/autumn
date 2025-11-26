"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useCustomerBalanceSheetStore } from "@/hooks/stores/useCustomerBalanceSheetStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import {
	useAttachProductStore,
	useEntity,
} from "@/hooks/stores/useSubscriptionStore";
import { pushPage } from "@/utils/genUtils";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { useCusQuery } from "../../customers/customer/hooks/useCusQuery";
import { useCusReferralQuery } from "../../customers/customer/hooks/useCusReferralQuery";
import { CustomerFeatureUsageTable } from "../components/table/customer-feature-usage/CustomerFeatureUsageTable";
import { CustomerInvoicesTable } from "../components/table/customer-invoices/CustomerInvoicesTable";
import { CustomerProductsTable } from "../components/table/customer-products/CustomerProductsTable";
import { CustomerUsageAnalyticsTable } from "../components/table/customer-usage-analytics/CustomerUsageAnalyticsTable";
import { CustomerActions } from "./CustomerActions";
import { CustomerBalanceSheets } from "./CustomerBalanceSheets";
import { CustomerBreadcrumbs } from "./CustomerBreadcrumbs2";
import { CustomerContext } from "./CustomerContext";
import { CustomerPageDetails } from "./CustomerPageDetails";
import { CustomerSheets } from "./CustomerSheets";
import { SelectedEntityDetails } from "./components/SelectedEntityDetails";
import { SHEET_ANIMATION } from "./customerAnimations";

export default function CustomerView2() {
	const { customer, isLoading: cusLoading } = useCusQuery();

	useCusReferralQuery();
	const { entityId, setEntityId } = useEntity();

	const closeSheet = useCustomerBalanceSheetStore((s) => s.closeSheet);
	const sheetType = useSheetStore((s) => s.type);
	const closeProductSheet = useSheetStore((s) => s.closeSheet);
	const customizedProduct = useAttachProductStore((s) => s.customizedProduct);

	// Close modal on mount
	useEffect(() => {
		closeSheet();
	}, [closeSheet]);

	// Clear selected entity on unmount (when navigating away)
	// useEffect(() => {
	// 	return () => {
	// 		setEntityId(null);
	// 	};
	// }, [setEntityId]);

	if (cusLoading) return <LoadingScreen />;

	if (!customer) {
		return (
			<ErrorScreen>
				<div className="text-t2 text-sm">Customer not found</div>
				<Link
					className="text-t3 text-xs hover:underline"
					to={pushPage({ path: "/customers" })}
				>
					Return
				</Link>
			</ErrorScreen>
		);
	}

	return (
		<CustomerContext.Provider
			value={{ customer, entityId: entityId, setEntityId }}
		>
			<div className="flex w-full h-full overflow-hidden relative">
				<motion.div
					className="h-full overflow-hidden absolute inset-0"
					animate={{
						width: sheetType ? "calc(100% - 28rem)" : "100%",
					}}
					transition={SHEET_ANIMATION}
				>
					<div className="flex flex-col overflow-x-hidden overflow-y-auto absolute inset-0 pb-8 [&>*:not([data-slot=separator-root])]:px-12 [&>*:not([data-slot=separator-root])]:pt-8 [&>*:not([data-slot=separator-root])]:max-w-5xl [&>*:not([data-slot=separator-root])]:mx-auto">
						<div className="flex flex-col gap-2 w-full">
							<div className="flex flex-col w-full">
								<div className="flex items-center justify-between w-full gap-4">
									<CustomerBreadcrumbs />
									<CustomerActions />
								</div>
								<div className="flex items-center justify-between w-full pt-2">
									<h3
										className={`text-md font-semibold ${
											customer.name
												? "text-t1"
												: customer.email
													? "text-t3"
													: "text-t4 font-mono font-medium!"
										}`}
									>
										{customer.name || customer.email || customer.id}
									</h3>

									<CustomerPageDetails />
								</div>
							</div>
							<SelectedEntityDetails />
						</div>
						{/* <Separator /> */}
						{/* <Separator className="my-2" /> */}
						<div className="flex flex-col gap-10 w-full">
							<CustomerProductsTable />
							{/* <Separator /> */}
							<CustomerFeatureUsageTable />
							{/* <Separator /> */}
							<CustomerUsageAnalyticsTable />
							{/* <Separator /> */}
							<CustomerInvoicesTable />
						</div>
					</div>
					{createPortal(
						<AnimatePresence>
							{sheetType && (
								<motion.div
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									className="fixed inset-0 bg-background/90"
									style={{ zIndex: 40 }}
									onMouseDown={() => {
										!customizedProduct && closeProductSheet();
									}}
								/>
							)}
						</AnimatePresence>,
						document.body,
					)}
				</motion.div>

				<CustomerBalanceSheets />
				<CustomerSheets />
			</div>
		</CustomerContext.Provider>
	);
}
