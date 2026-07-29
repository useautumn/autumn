import { useEffect } from "react";
import { toast } from "sonner";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import { getFeature } from "@/utils/product/entitlementUtils";
import { parsePlanItemClipboardText } from "../utils/planItemClipboard";

const isEditableTarget = (target: EventTarget | null) =>
	target instanceof HTMLElement &&
	(target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target.isContentEditable);

/** Pastes a copied plan item into the current plan on cmd+V. */
export const usePastePlanItem = () => {
	const { product, setProduct } = useProduct();
	const { sheetType } = useSheet();
	const { features } = useFeaturesQuery();

	useEffect(() => {
		const handlePaste = (event: ClipboardEvent) => {
			if (event.defaultPrevented) return;
			if (sheetType || isEditableTarget(event.target)) return;

			const text = event.clipboardData?.getData("text/plain");
			if (!text || !product?.items) return;

			const pastedItem = parsePlanItemClipboardText(text);
			if (!pastedItem?.feature_id) return;

			event.preventDefault();

			const feature = getFeature(pastedItem.feature_id, features);
			if (!feature) {
				toast.error(
					`Feature ${pastedItem.feature_id} doesn't exist in this org`,
				);
				return;
			}

			setProduct({ ...product, items: [...product.items, pastedItem] });
		};

		window.addEventListener("paste", handlePaste);
		return () => window.removeEventListener("paste", handlePaste);
	}, [sheetType, product, setProduct, features]);
};
