import { InsufficientBalanceError, type TrackParams } from "@autumn/shared";

export const handlePostgresTrackError = ({
	error,
	body,
}: {
	error: Error;
	body: TrackParams;
}): never => {
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

	throw error;
};
