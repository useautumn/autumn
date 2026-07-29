import { FormLabel, Input } from "@autumn/ui";
import {
	useIsLicenseEditor,
	useProduct,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
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
		<SheetSection>
			<div>
				<FormLabel>Included quantity</FormLabel>
				<Input
					type="text"
					inputMode="numeric"
					placeholder="eg. 1"
					value={draft ?? ""}
					onChange={(e) => {
						const raw = e.target.value;
						if (!DIGITS_ONLY.test(raw)) return;
						patchDraft(product.id, {
							included: raw === "" ? undefined : Number(raw),
						});
					}}
					aria-label="Included quantity"
				/>
			</div>
		</SheetSection>
	);
}
