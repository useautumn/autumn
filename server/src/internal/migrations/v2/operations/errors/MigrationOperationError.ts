export type MigrationOperationErrorCode =
	| "invalid_operation_input"
	| "unsupported_operation_input"
	| "missing_prepared_state";

export class MigrationOperationError extends Error {
	readonly code: MigrationOperationErrorCode;
	readonly operationType: string;
	readonly field?: string;
	readonly details?: Record<string, unknown>;

	constructor({
		message,
		code,
		operationType,
		field,
		details,
	}: {
		message: string;
		code: MigrationOperationErrorCode;
		operationType: string;
		field?: string;
		details?: Record<string, unknown>;
	}) {
		super(message);
		this.name = "MigrationOperationError";
		this.code = code;
		this.operationType = operationType;
		this.field = field;
		this.details = details;
	}
}
