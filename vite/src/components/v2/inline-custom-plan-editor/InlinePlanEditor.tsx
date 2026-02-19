import type { FrontendProduct } from "@autumn/shared";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
import { SheetOverlay } from "@/components/v2/sheet-overlay/SheetOverlay";
import { cn } from "@/lib/utils";
import { CustomerPlanInfoBox } from "@/views/customers2/customer-plan/CustomerPlanInfoBox";
import { EditPlanHeader } from "@/views/products/plan/components/EditPlanHeader";
import { PlanEditorBar } from "@/views/products/plan/components/PlanEditorBar";
import PlanCard from "@/views/products/plan/components/plan-card/PlanCard";
import { ProductSheets } from "@/views/products/plan/ProductSheets";
import { SHEET_ANIMATION } from "@/views/products/plan/planAnimations";
import { InlineEditorProvider } from "./InlineEditorContext";
import { useHasPlanChanges, useProduct, useSheet } from "./PlanEditorContext";

interface InlinePlanEditorProps {
	product: FrontendProduct;
	onSave: (product: FrontendProduct) => void;
	onCancel: () => void;
	isOpen: boolean;
}

export function InlinePlanEditor({
	product,
	onSave,
	onCancel,
	isOpen,
}: InlinePlanEditorProps) {
	const mainContent = document.querySelector("[data-main-content]");

	if (!mainContent) {
		console.error("[InlinePlanEditor] Could not find portal target");
		return null;
	}

	return createPortal(
		<AnimatePresence>
			{isOpen && (
				<InlineEditorProvider initialProduct={product}>
					<InlinePlanEditorContent onSave={onSave} onCancel={onCancel} />
				</InlineEditorProvider>
			)}
		</AnimatePresence>,
		mainContent,
	);
}

function InlinePlanEditorContent({
	onSave,
	onCancel,
}: {
	onSave: (product: FrontendProduct) => void;
	onCancel: () => void;
}) {
	const { product } = useProduct();
	const { sheetType } = useSheet();
	const hasPlanChanges = useHasPlanChanges();

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
					className={cn("h-full overflow-hidden absolute inset-0 z-0")}
					animate={{ width: sheetType ? "calc(100% - 28rem)" : "100%" }}
					transition={SHEET_ANIMATION}
				>
					<div className="flex flex-col justify-start h-full w-full overflow-x-hidden overflow-y-auto pb-20">
						<div onClick={(e) => e.stopPropagation()}>
							<EditPlanHeader />
						</div>
						<div className="flex flex-col w-full h-fit items-center justify-start pt-20 px-10 gap-4">
							<CustomerPlanInfoBox />
							<PlanCard />
						</div>
						{!sheetType && (
							<PlanEditorBar>
								<Button variant="secondary" onClick={onCancel}>
									Return to Customer
								</Button>
								{hasPlanChanges && (
									<ShortcutButton
										metaShortcut="s"
										onClick={() => onSave(product)}
									>
										Save Changes
									</ShortcutButton>
								)}
							</PlanEditorBar>
						)}
					</div>
					<SheetOverlay inline />
				</motion.div>

				<ProductSheets />
			</div>
		</motion.div>
	);
}
