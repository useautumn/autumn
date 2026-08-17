import { useState } from "react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import type { UseUpdateSubscriptionForm } from "@/components/forms/update-subscription-v2/hooks/useUpdateSubscriptionForm";
import { QuantityEditControl } from "./QuantityEditControl";

export interface LicenseQuantityEditor {
	form: UseAttachForm | UseUpdateSubscriptionForm;
	quantities: Record<string, number | undefined>;
	/** Current purchased totals per license (update flow) shown when unstaged. */
	existingQuantities?: Record<string, number>;
	/** Display staged totals without allowing edits (review stage). */
	readOnly?: boolean;
}

/** Edits the total seats purchased for a license (sent as license_quantities).
 * Totals are inclusive of the included amount; extras are billed prepaid. */
export function LicenseQuantityControl({
	editor,
	licensePlanId,
	includedQuantity,
	licenseName,
}: {
	editor: LicenseQuantityEditor;
	licensePlanId: string;
	includedQuantity: number;
	licenseName?: string;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const { form, quantities, existingQuantities, readOnly = false } = editor;
	const stagedQuantity = quantities[licensePlanId];
	const totalQuantity = Math.max(
		stagedQuantity ?? existingQuantities?.[licensePlanId] ?? includedQuantity,
		includedQuantity,
	);

	const handleEditingChange = (editing: boolean) => {
		if (editing && stagedQuantity !== totalQuantity) {
			form.setFieldValue(`licenseQuantities.${licensePlanId}`, totalQuantity);
		}
		setIsEditing(editing);
	};

	return (
		<QuantityEditControl
			displayText={`x${totalQuantity}`}
			hint={includedQuantity > 0 ? `${includedQuantity} included` : undefined}
			isEditing={isEditing}
			onEditingChange={handleEditingChange}
			readOnly={readOnly}
			title={licenseName ?? licensePlanId}
		>
			<form.AppField name={`licenseQuantities.${licensePlanId}`}>
				{(field) => (
					<field.QuantityField
						fullWidth
						hideFieldInfo
						label=""
						min={includedQuantity}
					/>
				)}
			</form.AppField>
		</QuantityEditControl>
	);
}
