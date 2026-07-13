import {
	type CustomizePlanLicense,
	type FrontendProduct,
	sortPlanItems,
} from "@autumn/shared";
import { Button, ShortcutButton } from "@autumn/ui";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { SheetOverlay } from "@/components/v2/sheet-overlay/SheetOverlay";
import { cn } from "@/lib/utils";
import { CustomerPlanInfoBox } from "@/views/customers2/customer-plan/CustomerPlanInfoBox";
import { EditPlanHeader } from "@/views/products/plan/components/EditPlanHeader";
import { PlanEditorBar } from "@/views/products/plan/components/PlanEditorBar";
import PlanCard from "@/views/products/plan/components/plan-card/PlanCard";
import { CreateLicenseButton } from "@/views/products/plan/components/plan-licenses/CreateLicenseButton";
import {
	collectLicensePatchAdds,
	LicenseCustomizeCollectorProvider,
	useHasCollectedLicenseChanges,
	useLicenseCollectorStore,
} from "@/views/products/plan/components/plan-licenses/LicenseCustomizeCollector";
import { LicensePlanCards } from "@/views/products/plan/components/plan-licenses/LicensePlanCards";
import { LinkLicenseButton } from "@/views/products/plan/components/plan-licenses/LinkLicenseButton";
import { PendingLicenseLinksProvider } from "@/views/products/plan/components/plan-licenses/PendingLicenseLinksContext";
import { SheetPanelHost } from "@/views/products/plan/components/SheetPanelHost";
import { ProductSheets } from "@/views/products/plan/ProductSheets";
import { SHEET_ANIMATION } from "@/views/products/plan/planAnimations";
import { InlineEditorProvider } from "./InlineEditorContext";
import { useHasPlanChanges, useProduct, useSheet } from "./PlanEditorContext";

interface InlinePlanEditorProps {
	product: FrontendProduct;
	onSave: (
		product: FrontendProduct,
		addLicenses?: CustomizePlanLicense[],
	) => void;
	onCancel: () => void;
	isOpen: boolean;
	/** Render the plan's license cards and collect edits into onSave's
	 * `addLicenses` — only for flows whose payload supports a license patch. */
	enableLicenseEditing?: boolean;
}

export function InlinePlanEditor({
	product,
	onSave,
	onCancel,
	isOpen,
	enableLicenseEditing = false,
}: InlinePlanEditorProps) {
	const mainContent = document.querySelector("[data-main-content]");

	useEffect(() => {
		if (!(mainContent instanceof HTMLElement) || !isOpen) return;
		const previousOverflow = mainContent.style.overflow;
		mainContent.style.overflow = "hidden";
		return () => {
			mainContent.style.overflow = previousOverflow;
		};
	}, [mainContent, isOpen]);

	if (!mainContent) {
		console.error("[InlinePlanEditor] Could not find portal target");
		return null;
	}

	return createPortal(
		<AnimatePresence>
			{isOpen && (
				<InlineEditorProvider initialProduct={product}>
					<LicenseCustomizeCollectorProvider>
						<PendingLicenseLinksProvider>
							<InlinePlanEditorContent
								onSave={onSave}
								onCancel={onCancel}
								enableLicenseEditing={enableLicenseEditing}
							/>
						</PendingLicenseLinksProvider>
					</LicenseCustomizeCollectorProvider>
				</InlineEditorProvider>
			)}
		</AnimatePresence>,
		mainContent,
	);
}

function InlinePlanEditorContent({
	onSave,
	onCancel,
	enableLicenseEditing,
}: {
	onSave: (
		product: FrontendProduct,
		addLicenses?: CustomizePlanLicense[],
	) => void;
	onCancel: () => void;
	enableLicenseEditing: boolean;
}) {
	const { product } = useProduct();
	const { sheetType } = useSheet();
	const hasPlanChanges = useHasPlanChanges();
	const collectorStore = useLicenseCollectorStore();
	const hasLicenseChanges = useHasCollectedLicenseChanges();
	const hasChanges = hasPlanChanges || hasLicenseChanges;

	const handleSave = () => {
		// Only the edited cards go into add_licenses; untouched licenses keep
		// inheriting the plan catalog.
		const addLicenses =
			hasLicenseChanges && collectorStore
				? collectLicensePatchAdds(collectorStore)
				: undefined;
		onSave(
			{ ...product, items: sortPlanItems({ items: product.items }) },
			addLicenses,
		);
	};

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.97, y: 8 }}
			animate={{ opacity: 1, scale: 1, y: 0 }}
			exit={{ opacity: 0, scale: 0.97, y: 8 }}
			transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
			className="absolute inset-0 z-100 bg-background flex flex-col"
			data-inline-editor-open
		>
			<div className="flex w-full h-full overflow-hidden relative flex-1">
				<motion.div
					className={cn("h-full overflow-hidden absolute inset-0")}
					animate={{ width: sheetType ? "calc(100% - 28rem)" : "100%" }}
					transition={SHEET_ANIMATION}
				>
					{/* pb matches PlanEditorBar's h-40 so the last card scrolls clear of it */}
					<div className="flex flex-col justify-start h-full w-full overflow-x-hidden overflow-y-auto pb-40">
						<div onClick={(e) => e.stopPropagation()}>
							<EditPlanHeader />
						</div>
						<div className="flex flex-col w-full h-fit items-center justify-start pt-20 px-10 gap-4">
							<CustomerPlanInfoBox />
							<PlanCard />
							{enableLicenseEditing && (
								<>
									<LicensePlanCards />
									<LinkLicenseButton />
									<CreateLicenseButton />
								</>
							)}
						</div>
						{!sheetType && (
							<PlanEditorBar>
								<Button variant="secondary" onClick={onCancel}>
									Return to Customer
								</Button>
								{hasChanges && (
									<ShortcutButton metaShortcut="s" onClick={handleSave}>
										Save Changes
									</ShortcutButton>
								)}
							</PlanEditorBar>
						)}
					</div>
				</motion.div>

				<SheetOverlay inline />

				<ProductSheets />
				<SheetPanelHost />
			</div>
		</motion.div>
	);
}
