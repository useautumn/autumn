export type ApprovalSheetSeed = {
	approvalId: string | null;
	defaultOverrides: Record<string, unknown>;
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
	};
};
