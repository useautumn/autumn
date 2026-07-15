import { useState } from "react";
import type { UseAttachForm } from "@/components/forms/attach-v2/hooks/useAttachForm";
import { QuantityEditControl } from "./QuantityEditControl";

export interface LicenseQuantityEditor {
	form: UseAttachForm;
	quantities: Record<string, number | undefined>;
}

/** Edits the total seats purchased for a license (sent as license_quantities).
 * Totals are inclusive of the included amount; extras are billed prepaid. */
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
	const { form, quantities } = editor;
	const stagedQuantity = quantities[licensePlanId];
	const totalQuantity = Math.max(
		stagedQuantity ?? includedQuantity,
		includedQuantity,
	);
	const paidQuantity = totalQuantity - includedQuantity;

	const handleEditingChange = (editing: boolean) => {
		if (editing && stagedQuantity !== totalQuantity) {
			form.setFieldValue(`licenseQuantities.${licensePlanId}`, totalQuantity);
		}
		setIsEditing(editing);
	};

	return (
		<div className="flex items-center gap-2 shrink-0">
			{paidQuantity > 0 && (
				<span className="text-tertiary-foreground">
					{includedQuantity} included + {paidQuantity} paid
				</span>
			)}
			<QuantityEditControl
				readOnly={false}
				displayText={`x${totalQuantity}`}
				isEditing={isEditing}
				onEditingChange={handleEditingChange}
			>
				<form.AppField name={`licenseQuantities.${licensePlanId}`}>
					{(field) => (
						<field.QuantityField
							label=""
							min={includedQuantity}
							hideFieldInfo
						/>
					)}
				</form.AppField>
			</QuantityEditControl>
		</div>
	);
}
