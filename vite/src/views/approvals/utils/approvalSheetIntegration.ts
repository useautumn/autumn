export type ApprovalSheetSeed = {
	approvalId: string | null;
	defaultOverrides: Record<string, unknown>;
	prefillFailed: boolean;
	unmappedRequestKeys: string[];
};

export const approvalSeedFromSheetData = (
	data: Record<string, unknown> | null,
): ApprovalSheetSeed | undefined => {
	if (!data || !("approvalId" in data)) return undefined;
	return {
		approvalId: typeof data.approvalId === "string" ? data.approvalId : null,
		defaultOverrides:
			data.defaultOverrides && typeof data.defaultOverrides === "object"
				? (data.defaultOverrides as Record<string, unknown>)
				: {},
		prefillFailed: data.prefillFailed === true,
		unmappedRequestKeys: Array.isArray(data.unmappedRequestKeys)
			? data.unmappedRequestKeys.filter(
					(key): key is string => typeof key === "string",
				)
			: [],
	};
};
