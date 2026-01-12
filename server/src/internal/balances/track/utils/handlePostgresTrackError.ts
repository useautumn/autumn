import { InsufficientBalanceError, type TrackParams } from "@autumn/shared";

/**
 * Handles errors from Postgres deduction.
 * Converts PostgreSQL INSUFFICIENT_BALANCE exception to InsufficientBalanceError.
 */
export const handlePostgresTrackError = ({
	error,
	body,
}: {
	error: Error;
	body: TrackParams;
}): never => {
	// Check if it's an insufficient balance error from PostgreSQL
	// Format: INSUFFICIENT_BALANCE|featureId:{id}|value:{amount}|remaining:{remaining}
	if (error.message?.includes("INSUFFICIENT_BALANCE")) {
		const parts = error.message.split("|");
		const featureIdMatch = parts[1]?.match(/featureId:(.*)/);
		const valueMatch = parts[2]?.match(/value:(.*)/);

		const featureId = featureIdMatch?.[1] || body.feature_id;
		const value = valueMatch?.[1]
			? Number.parseFloat(valueMatch[1])
			: (body.value ?? 1);

		throw new InsufficientBalanceError({
			value,
			featureId,
			eventName: body.event_name,
		});
	}

	// Rethrow all other errors
	throw error;
};
