import type { FrontendProduct, ProductItem } from "@autumn/shared";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { Button } from "@/components/v2/buttons/Button";
import { ShortcutButton } from "@/components/v2/buttons/ShortcutButton";
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
	productName?: string;
	onSave: (items: ProductItem[]) => void;
	onCancel: () => void;
}

export function InlinePlanEditor({
	product,
	onSave,
	onCancel,
}: InlinePlanEditorProps) {
	const mainContent = document.querySelector("[data-main-content]");

	if (!mainContent) {
		console.error("[InlinePlanEditor] Could not find portal target");
		return null;
	}

	return createPortal(
		<InlineEditorProvider initialProduct={product}>
			<InlinePlanEditorContent onSave={onSave} onCancel={onCancel} />
		</InlineEditorProvider>,
		mainContent,
	);
}

function InlinePlanEditorContent({
	onSave,
	onCancel,
}: {
	onSave: (items: ProductItem[]) => void;
	onCancel: () => void;
}) {
	const { product } = useProduct();
	const { sheetType, closeSheet } = useSheet();
	const hasPlanChanges = useHasPlanChanges();

	return (
		<motion.div
			initial={{ opacity: 0, scale: 0.97, y: 8 }}
			animate={{ opacity: 1, scale: 1, y: 0 }}
			transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
			className="absolute inset-0 z-100 bg-background flex flex-col"
		>
			<div className="flex w-full h-full overflow-hidden relative flex-1">
				<motion.div
					className={cn(
						"h-full overflow-hidden absolute inset-0",
						sheetType && "pointer-events-none",
					)}
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
										onClick={() => onSave(product.items)}
									>
										Save Changes
									</ShortcutButton>
								)}
							</PlanEditorBar>
						)}
					</div>
				</motion.div>

				<AnimatePresence>
					{sheetType && (
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							className="absolute inset-0 bg-white/70 dark:bg-black/70"
							style={{ zIndex: 40 }}
							onMouseDown={() => closeSheet()}
						/>
					)}
				</AnimatePresence>

				<ProductSheets />
			</div>
		</motion.div>
	);
}
