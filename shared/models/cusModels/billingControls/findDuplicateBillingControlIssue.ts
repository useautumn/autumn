import type { BillingControlKey } from "./customerBillingControls.js";

type DuplicateBillingControlIssue = {
	code: "custom";
	message: string;
	input: unknown;
	path: Array<string | number>;
};

/**
 * The validation issue for the first entry whose identity repeats an earlier
 * one; entries with no identity (no feature_id) are never duplicates.
 */
export const findDuplicateBillingControlIssue = <TControl>({
	controlKey,
	controls,
	identityOf,
	field,
	message,
}: {
	controlKey: BillingControlKey;
	controls: TControl[] | null | undefined;
	identityOf: (control: TControl) => string | undefined;
	field: keyof TControl & string;
	message: string;
}): DuplicateBillingControlIssue | undefined => {
	const seen = new Set<string>();

	for (const [index, control] of (controls ?? []).entries()) {
		const identity = identityOf(control);
		if (identity === undefined) continue;

		if (seen.has(identity)) {
			return {
				code: "custom",
				message,
				input: control[field],
				path: [controlKey, index, field],
			};
		}
		seen.add(identity);
	}
	return undefined;
};

export const featureIdIdentity = (control: {
	feature_id?: string;
}): string | undefined => control.feature_id;
