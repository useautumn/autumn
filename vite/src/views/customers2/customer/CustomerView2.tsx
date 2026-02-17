"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { useHasChanges } from "@/hooks/stores/useProductStore";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { pushPage } from "@/utils/genUtils";
import ErrorScreen from "@/views/general/ErrorScreen";
import LoadingScreen from "@/views/general/LoadingScreen";
import { OnboardingGuide } from "@/views/onboarding4/OnboardingGuide";
import { useCusQuery } from "../../customers/customer/hooks/useCusQuery";
import { useCusReferralQuery } from "../../customers/customer/hooks/useCusReferralQuery";
import { CustomerPlansSection } from "../components/CustomerPlansSection";
import { CustomerFeatureUsageTable } from "../components/table/customer-feature-usage/CustomerFeatureUsageTable";
import { CustomerInvoicesTable } from "../components/table/customer-invoices/CustomerInvoicesTable";
import { CustomerUsageAnalyticsTable } from "../components/table/customer-usage-analytics/CustomerUsageAnalyticsTable";
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

	const sheetType = useSheetStore((s) => s.type);
	const closeProductSheet = useSheetStore((s) => s.closeSheet);
	const sheetData = useSheetStore((s) => s.data);
	const hasChanges = useHasChanges();
	const hasCustomizedProduct = !!sheetData?.customizedProduct;
	const isMobile = useIsMobile();
	const [isInlineEditorOpen, setIsInlineEditorOpen] = useState(false);

	// useSheetCleanup();

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
			value={{
				customer,
				entityId: entityId,
				setEntityId,
				isInlineEditorOpen,
				setIsInlineEditorOpen,
			}}
		>
			<div className="flex w-full h-full overflow-hidden relative">
				<motion.div
					className="h-full overflow-hidden absolute inset-0 z-0"
					animate={{
						width: sheetType && !isMobile ? "calc(100% - 28rem)" : "100%",
					}}
					transition={SHEET_ANIMATION}
				>
					<div className="flex flex-col overflow-x-hidden overflow-y-auto absolute inset-0 pb-8">
						<div className="w-full max-w-5xl mx-auto pt-4 sm:pt-8 pb-6 px-4 sm:px-10">
							<OnboardingGuide />
						</div>
						{/* Rest of content shrinks normally with the container */}
						<div className="flex flex-col gap-4 w-full max-w-5xl mx-auto pt-4 px-4 sm:px-10">
							<div className="flex flex-col gap-2 w-full">
								<div className="flex flex-col w-full">
									<div className="flex items-center justify-between w-full gap-4">
										<CustomerBreadcrumbs />
									</div>
									<div className="flex items-center flex-wrap justify-between w-full pt-2 gap-2">
										<h3
											className={`text-md font-semibold truncate ${
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
							<div className="flex flex-col gap-12 w-full">
								<CustomerPlansSection />
								<CustomerFeatureUsageTable />
								<CustomerUsageAnalyticsTable />
								<CustomerInvoicesTable />
							</div>
						</div>
					</div>
					{!isMobile &&
						createPortal(
							<AnimatePresence>
								{sheetType && !isInlineEditorOpen && (
									<motion.div
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										className="fixed inset-0 bg-white/60 dark:bg-black/60"
										style={{ zIndex: 40 }}
										onMouseDown={() => {
											!hasCustomizedProduct && closeProductSheet();
										}}
									/>
								)}
							</AnimatePresence>,
							document.body,
						)}
				</motion.div>

				<CustomerSheets />
			</div>
		</CustomerContext.Provider>
	);
}
