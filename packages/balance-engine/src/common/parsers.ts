import {
	type CheckCommand,
	type CustomerMeteringState,
	checkCommandSchema,
	customerMeteringStateSchema,
	type StateInitializedEvent,
	stateInitializedEventSchema,
	type TrackCommand,
	type TrackOutcome,
	trackCommandSchema,
	trackOutcomeSchema,
} from "../contracts.js";

export const parseTrackCommand = ({
	input,
}: {
	input: unknown;
}): TrackCommand => trackCommandSchema.parse(input);

export const parseCheckCommand = ({
	input,
}: {
	input: unknown;
}): CheckCommand => checkCommandSchema.parse(input);

export const parseTrackOutcome = ({
	input,
}: {
	input: unknown;
}): TrackOutcome => trackOutcomeSchema.parse(input);

export const parseCustomerMeteringState = ({
	input,
}: {
	input: unknown;
}): CustomerMeteringState => customerMeteringStateSchema.parse(input);

export const parseStateInitializedEvent = ({
	input,
}: {
	input: unknown;
}): StateInitializedEvent => stateInitializedEventSchema.parse(input);
