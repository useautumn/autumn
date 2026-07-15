import { useState } from "react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { QuantityEditControl } from "./QuantityEditControl";

export interface LicenseQuantityEditor {
	form: UseAttachForm;
	includedQuantities: Record<string, number | undefined>;
}

/** Edits a license's included seat quantity — the same value the customize
 * plan editor stages via upsert_licenses. */
export function LicenseQuantityControl({
	editor,
	licensePlanId,
	includedQuantity,
}: {
	editor: LicenseQuantityEditor;
	licensePlanId: string;
	includedQuantity: number;
}) {
	const [isEditing, setIsEditing] = useState(false);
	const { form, includedQuantities } = editor;

	const handleEditingChange = (editing: boolean) => {
		if (editing && includedQuantities[licensePlanId] === undefined) {
			form.setFieldValue(
				`licenseIncludedQuantities.${licensePlanId}`,
				includedQuantity,
			);
		}
		setIsEditing(editing);
	};

	return (
		<QuantityEditControl
			readOnly={false}
			displayText={`x${includedQuantity}`}
			isEditing={isEditing}
			onEditingChange={handleEditingChange}
		>
			<form.AppField name={`licenseIncludedQuantities.${licensePlanId}`}>
				{(field) => <field.QuantityField label="" min={0} hideFieldInfo />}
			</form.AppField>
		</QuantityEditControl>
	);
}
