export const getMigrationOperationId = ({
	migrationRunId,
	pageId,
	patchIndex,
	operation,
}: {
	migrationRunId: string;
	pageId: string | undefined;
	patchIndex: number;
	operation: { type: "add"; index: number } | { type: "repoint" };
}): string | undefined => {
	if (pageId === undefined) return undefined;

	const identity = [migrationRunId, pageId, patchIndex, operation.type];
	if (operation.type === "add") identity.push(operation.index);
	return JSON.stringify(identity);
};
