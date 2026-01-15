import type { FrontendProduct, ProductItem } from "@autumn/shared";
import { AnimatePresence, motion } from "motion/react";
import { createPortal } from "react-dom";
import { Button } from "@/components/v2/buttons/Button";
import { CustomerPlanInfoBox } from "@/views/customers2/customer-plan/CustomerPlanInfoBox";
import { EditPlanHeader } from "@/views/products/plan/components/EditPlanHeader";
import { PlanEditorBar } from "@/views/products/plan/components/PlanEditorBar";
import { SHEET_ANIMATION } from "@/views/products/plan/planAnimations";
import {
	InlineEditorProvider,
	useInlineEditorContext,
} from "./InlineEditorContext";
import { InlinePlanCard } from "./InlinePlanCard";
import { InlineProductSheets } from "./InlineProductSheets";

interface InlinePlanEditorProps {
	product: FrontendProduct;
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
	const { product, sheetType, closeSheet } = useInlineEditorContext();

	return (
		<div className="absolute inset-0 z-100 bg-background flex flex-col">
			<div className="flex w-full h-full overflow-hidden relative flex-1">
				<motion.div
					className="h-full overflow-hidden absolute inset-0"
					animate={{ width: sheetType ? "calc(100% - 28rem)" : "100%" }}
					transition={SHEET_ANIMATION}
				>
					<div className="flex flex-col justify-start h-full w-full overflow-x-hidden overflow-y-auto pb-20">
						<div onClick={(e) => e.stopPropagation()}>
							<EditPlanHeader />
						</div>
						<div className="flex flex-col w-full h-fit items-center justify-start pt-20 px-10 gap-4">
							<CustomerPlanInfoBox />
							<InlinePlanCard />
						</div>
						{!sheetType && (
							<PlanEditorBar>
								<Button variant="secondary" onClick={onCancel}>
									Return to Customer
								</Button>
								<Button onClick={() => onSave(product.items)}>
									Save Changes
								</Button>
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

				<InlineProductSheets />
			</div>
		</div>
	);
}
