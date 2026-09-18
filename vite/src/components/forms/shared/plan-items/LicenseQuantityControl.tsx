import type { ReactNode } from "react";
import { useState } from "react";
import { QuantityEditControl } from "./QuantityEditControl";

export type LicenseEditStart = (params: {
	licensePlanId: string;
	quantity: number;
}) => void;

export type LicenseFieldRenderer = (params: {
	licensePlanId: string;
	min: number;
}) => ReactNode;

export interface LicenseQuantityEditor {
	quantities: Record<string, number | undefined>;
	/** Current purchased totals per license (update flow) shown when unstaged. */
	existingQuantities?: Record<string, number>;
	/** Display staged totals without allowing edits (review stage). */
	readOnly?: boolean;
	/** Stages the total on edit-open, so the field below always renders against
	 * a value the form already holds. */
	onEditStart: LicenseEditStart;
	/** Owned by the caller so each form binds its own typed field path. */
	renderField: LicenseFieldRenderer;
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
	const {
		quantities,
		existingQuantities,
		readOnly = false,
		onEditStart,
		renderField,
	} = editor;
	const stagedQuantity = quantities[licensePlanId];
	const totalQuantity = Math.max(
		stagedQuantity ?? existingQuantities?.[licensePlanId] ?? includedQuantity,
		includedQuantity,
	);

	const handleEditingChange = (editing: boolean) => {
		if (editing) onEditStart({ licensePlanId, quantity: totalQuantity });
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
			{renderField({ licensePlanId, min: includedQuantity })}
		</QuantityEditControl>
	);
}
