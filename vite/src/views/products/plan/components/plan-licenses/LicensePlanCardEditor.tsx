import type {
	CustomizePlanLicense,
	PlanLicense,
	PlanLicenseParams,
	ProductV2,
} from "@autumn/shared";
import { useEffect } from "react";
import {
	useProduct,
	useSheet,
} from "@/components/v2/inline-custom-plan-editor/PlanEditorContext";
import { cn } from "@/lib/utils";
import PlanCard from "@/views/products/plan/components/plan-card/PlanCard";
import { LicensePlanCardHeader } from "./LicensePlanCardHeader";
import {
	LICENSE_CARD_ACTIVE_CLASS,
	LicenseSheetPortal,
} from "./LicenseSheetPortal";
import type { LicenseEditSnapshot } from "./licenseCustomizeUtils";
import { useLicenseDraft } from "./useLicenseDraftStore";
import { useLicensePlanCardLifecycle } from "./useLicensePlanCardLifecycle";
import { useLicenseRowStore } from "./useLicenseRowStore";

export function LicensePlanCardEditor({
	planLicense,
	license,
	buildEntry,
	buildCustomize,
	isPendingLink,
	isLast,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
	buildEntry: (snapshot: LicenseEditSnapshot) => PlanLicenseParams;
	buildCustomize: (snapshot: LicenseEditSnapshot) => CustomizePlanLicense;
	isPendingLink: boolean;
	isLast: boolean;
}) {
	const { product: liveLicense } = useProduct();
	const { sheetType, setSheet } = useSheet();
	useLicensePlanCardLifecycle({
		planLicense,
		license,
		buildEntry,
		buildCustomize,
		isPendingLink,
	});

	const publish = useLicenseRowStore((s) => s.publish);
	const clear = useLicenseRowStore((s) => s.clear);
	const requestedOpen = useLicenseRowStore((s) => s.openRequests[license.id]);
	const consumeOpen = useLicenseRowStore((s) => s.consumeOpen);

	useEffect(() => {
		publish(license.id, {
			product: liveLicense,
			isEditingPrice: sheetType === "edit-plan-price",
		});
	}, [publish, license.id, liveLicense, sheetType]);

	useEffect(() => () => clear(license.id), [clear, license.id]);

	useEffect(() => {
		if (!requestedOpen) return;
		consumeOpen(license.id);
		setSheet({ type: "edit-plan-price", itemId: license.id });
	}, [requestedOpen, consumeOpen, setSheet, license.id]);

	const removed = useLicenseDraft(license.id)?.removed ?? false;

	const isActiveEditor = sheetType !== null;

	return (
		<div className="relative w-full flex flex-col items-center">
			<div className="relative w-full max-w-xl pl-12">
				{!isLast && (
					<div
						aria-hidden
						className="absolute left-6 -top-6 -bottom-6 border-l border-border"
					/>
				)}
				<div
					aria-hidden
					className="absolute left-6 -top-6 bottom-1/2 w-6 rounded-bl-xl border-b border-l border-border"
				/>
				<div
					className={cn(
						"isolate relative flex justify-center transition-[opacity,filter] duration-200 ease-out",
						removed && "opacity-50 grayscale",
						isActiveEditor && LICENSE_CARD_ACTIVE_CLASS,
					)}
				>
					<PlanCard
						slim
						header={
							<LicensePlanCardHeader
								planLicense={planLicense}
								license={license}
								isPendingLink={isPendingLink}
							/>
						}
					/>
				</div>
			</div>

			<LicenseSheetPortal />
		</div>
	);
}
