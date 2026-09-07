import {
	CorruptBalanceStateError,
	MeteringStatePartitionMismatchError,
	PartitionProgressNotFoundError,
	UnsupportedBalanceStateSchemaVersionError,
} from "../../state/sqliteBalanceStateErrors.js";

export const receiptCleanupRequiresRecovery = ({
	cause,
}: {
	cause: unknown;
}): boolean => {
	if (
		cause instanceof CorruptBalanceStateError ||
		cause instanceof MeteringStatePartitionMismatchError ||
		cause instanceof PartitionProgressNotFoundError ||
		cause instanceof UnsupportedBalanceStateSchemaVersionError
	)
		return true;
	if (typeof cause !== "object" || cause === null || !("code" in cause))
		return false;
	return (
		typeof cause.code === "string" &&
		/^(SQLITE_CORRUPT|SQLITE_NOTADB|SQLITE_CONSTRAINT|SQLITE_MISUSE)(_|$)/.test(
			cause.code,
		)
	);
};
