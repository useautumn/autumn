import {
	useIsLicenseEditor,
	useProduct,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { InfoBox } from "@/views/onboarding2/integrate/components/InfoBox";
import { useLicenseCollectorStore } from "./LicenseCustomizeCollector";

/** Notice in a license card's sheets on the plan page, where edits change the
 * underlying license plan everywhere it's offered. Customize editors stage
 * per-customer patches instead, so it hides there. */
export function LicenseEditScopeNotice() {
	const isLicenseEditor = useIsLicenseEditor();
	const collectorStore = useLicenseCollectorStore();
	const { product } = useProduct();

	if (!isLicenseEditor || collectorStore) return null;

	return (
		<div className="px-4 pt-4">
			<InfoBox variant="warning">
				You're editing the{" "}
				<span className="font-medium">{product.name || product.id}</span> plan
				itself — changes apply everywhere this license is offered.
			</InfoBox>
		</div>
	);
}
