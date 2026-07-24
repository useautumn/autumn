export const operationsOrUndefined = <T>(operations: T[]) =>
	operations.length > 0 ? operations : undefined;
