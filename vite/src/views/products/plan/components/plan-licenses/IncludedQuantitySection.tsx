import { Input } from "@autumn/ui";
import {
	useIsLicenseEditor,
	useProduct,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import {
	useIsLicenseDraftSeeded,
	useLicenseDraftStore,
} from "./useLicenseDraftStore";

const DIGITS_ONLY = /^\d*$/;

/**
 * "Included quantity" field for a license, shown in its Plan Settings sheet. The
 * value is a draft (seeded by the license card) that persists when the plan is
 * saved. Renders nothing outside a plan-license editor.
 */
export function IncludedQuantitySection() {
	const { product } = useProduct();
	const isLicenseEditor = useIsLicenseEditor();
	const draft = useLicenseDraftStore((s) => s.drafts[product.id]?.included);
	const patchDraft = useLicenseDraftStore((s) => s.patch);
	const isSeeded = useIsLicenseDraftSeeded(product.id);

	if (!isLicenseEditor || !isSeeded) return null;

	return (
		<SheetSection title="Included quantity">
			<Input
				type="text"
				inputMode="numeric"
				value={draft ?? ""}
				onChange={(e) => {
					const raw = e.target.value;
					if (!DIGITS_ONLY.test(raw)) return;
					patchDraft(product.id, {
						included: raw === "" ? undefined : Number(raw),
					});
				}}
				className="w-24"
				aria-label="Included quantity"
			/>
			<p className="text-body-secondary mt-2">
				How many of this license the plan includes for assignment to entities.
			</p>
		</SheetSection>
	);
}
