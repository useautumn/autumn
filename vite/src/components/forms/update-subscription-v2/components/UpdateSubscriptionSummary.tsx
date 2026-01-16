import {
	type FullCusProduct,
	generateTrialChanges,
	generateVersionChanges,
	type ItemEdit,
} from "@autumn/shared";
import { useStore } from "@tanstack/react-form";
import { useMemo } from "react";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import type { UseUpdateSubscriptionForm } from "../hooks/useUpdateSubscriptionForm";
import { SummaryItemRow } from "./SummaryItemRow";

interface UpdateSubscriptionSummaryProps {
	form: UseUpdateSubscriptionForm;
	customerProduct: FullCusProduct;
	currentVersion: number;
}

export function UpdateSubscriptionSummary({
	form,
	customerProduct,
	currentVersion,
}: UpdateSubscriptionSummaryProps) {
	const formValues = useStore(form.store, (state) => state.values);

	const changes = useMemo((): ItemEdit[] => {
		const trialChanges = generateTrialChanges({
			customerProduct,
			removeTrial: formValues.removeTrial,
			trialLength: formValues.trialLength,
			trialDuration: formValues.trialDuration,
		});

		const versionChanges = generateVersionChanges({
			originalVersion: currentVersion,
			updatedVersion: formValues.version,
		});

		return [...versionChanges, ...trialChanges];
	}, [
		formValues.removeTrial,
		formValues.trialLength,
		formValues.trialDuration,
		formValues.version,
		customerProduct,
		currentVersion,
	]);

	if (changes.length === 0) return null;

	return (
		<SheetSection title="Changes" withSeparator>
			<div className="space-y-2">
				{changes.map((change) => (
					<SummaryItemRow key={change.id} item={change} />
				))}
			</div>
		</SheetSection>
	);
}
