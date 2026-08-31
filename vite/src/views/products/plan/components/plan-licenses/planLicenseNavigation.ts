/** Opens the license editor on the anchored child row, with a return path to the parent version. */
export const licenseEditorQueryParams = ({
	parentPlanId,
	parentVersion,
	licenseVersion,
}: {
	parentPlanId: string;
	parentVersion?: number;
	licenseVersion: number;
}): Record<string, string | undefined> => ({
	fromPlan: parentPlanId,
	fromPlanVersion:
		parentVersion === undefined ? undefined : String(parentVersion),
	version: String(licenseVersion),
});

export const parentPlanEditorQueryParams = ({
	parentVersion,
}: {
	parentVersion?: number | null;
}): Record<string, string> | undefined => {
	if (parentVersion == null) return undefined;
	return { version: String(parentVersion) };
};
