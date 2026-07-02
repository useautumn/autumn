import {
	type FrontendProduct,
	type PlanLicense,
	type ProductV2,
	sortPlanItems,
} from "@autumn/shared";
import { useEffect, useRef } from "react";
import {
	useHasPlanChanges,
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import PlanCard from "@/views/products/plan/components/plan-card/PlanCard";
import { LicensePlanCardChrome } from "./LicensePlanCardChrome";
import {
	LICENSE_CARD_ACTIVE_CLASS,
	LicenseCardDim,
	LicenseSheetPortal,
} from "./LicenseSheetPortal";
import {
	useLicenseQuantity,
	useLicenseQuantityStore,
} from "./useLicenseQuantityStore";
import { useLicenseSaveRegistry } from "./useLicenseSaveRegistry";
import { useIsLicenseSheetOpen } from "./useLicenseSheetStore";

export function LicensePlanCardEditor({
	planLicense,
	license,
	onSave,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	onSave: (product: FrontendProduct) => Promise<boolean>;
}) {
	const { product } = useProduct();
	const { sheetType, itemDraft } = useSheet();
	const globalSheetOpen = useSheetStore((s) => s.type !== null);
	const anyLicenseSheetOpen = useIsLicenseSheetOpen();

	const includedQuantity = useLicenseQuantity(
		license.id,
		planLicense.included_quantity,
	);
	const quantityChanged = includedQuantity !== planLicense.included_quantity;
	const hasChanges = useHasPlanChanges() || quantityChanged;

	// Register this license's pending save with the plan-level save bar, so saving
	// the plan persists every dirty license too (one save for everything). The
	// draft is read through a ref at save time, so only `dirty` need re-register.
	const register = useLicenseSaveRegistry((s) => s.register);
	const unregister = useLicenseSaveRegistry((s) => s.unregister);
	const seedQuantity = useLicenseQuantityStore((s) => s.set);
	const clearQuantity = useLicenseQuantityStore((s) => s.clear);
	const saveRef = useRef<() => Promise<boolean>>(async () => true);
	saveRef.current = async () => {
		const success = await onSave({
			...product,
			items: sortPlanItems({ items: product.items }),
		});
		if (success) {
			// Commit so the card stops reading as dirty; the quantity draft falls
			// back to the refetched persisted value.
			itemDraft.commit();
			seedQuantity(license.id, undefined);
		}
		return success;
	};

	const discardRef = useRef<() => void>(() => {});
	discardRef.current = () => {
		itemDraft.discard();
		seedQuantity(license.id, planLicense.included_quantity);
	};

	// Bridge this license to the plan-level save bar: seed its included-quantity
	// draft and register its save (dirty state + a ref-read save), releasing both
	// on unmount so the save bar tracks exactly the mounted licenses.
	useEffect(() => {
		seedQuantity(license.id, planLicense.included_quantity);
		return () => clearQuantity(license.id);
	}, [license.id, planLicense.included_quantity, seedQuantity, clearQuantity]);

	useEffect(() => {
		register(license.id, {
			dirty: hasChanges,
			save: () => saveRef.current(),
			discard: () => discardRef.current(),
		});
		return () => unregister(license.id);
	}, [license.id, hasChanges, register, unregister]);

	// This license is the active editor when its own sheet is open. When some
	// other editor's sheet is open (the parent plan, or a sibling license), dim
	// this card to match — that editor's overlay can't reach it across contexts.
	const isActiveEditor = sheetType !== null;
	const isOtherSheetOpen =
		!isActiveEditor && (globalSheetOpen || anyLicenseSheetOpen);

	return (
		<div
			className={cn(
				"relative w-full flex flex-col items-center gap-2",
				isActiveEditor && LICENSE_CARD_ACTIVE_CLASS,
			)}
		>
			<LicensePlanCardChrome planLicense={planLicense} license={license} />
			<div className="relative w-full flex justify-center">
				<PlanCard />
				<LicenseCardDim show={isOtherSheetOpen} />
			</div>

			<LicenseSheetPortal />
		</div>
	);
}
