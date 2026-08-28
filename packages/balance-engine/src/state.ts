import { Decimal } from "decimal.js";
import {
	type CheckCommand,
	checkCommandSchema,
	type DirectMeteredV1FeatureState,
	type MeteringIdentity,
	type MeteringState,
	meteringStateSchema,
	type TrackCommand,
	type TrackOutcome,
	trackCommandSchema,
	trackOutcomeSchema,
} from "./contracts.js";

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

export const createMeteringState = ({
	identity,
	features,
}: {
	identity: MeteringIdentity;
	features: Record<string, DirectMeteredV1FeatureState>;
}): MeteringState =>
	meteringStateSchema.parse({
		schemaVersion: 1,
		identity,
		revision: 0,
		features,
	});

export const meteringPartitionKeyOf = ({
	identity,
}: {
	identity: MeteringIdentity;
}): string =>
	JSON.stringify([identity.orgId, identity.env, identity.customerId]);

export const shadowComparisonKeyOf = ({
	command,
}: {
	command: TrackCommand;
}): string =>
	JSON.stringify([
		command.identity.orgId,
		command.identity.env,
		command.identity.customerId,
		command.featureId,
		command.commandId,
	]);

export const identitiesMatch = ({
	left,
	right,
}: {
	left: MeteringIdentity;
	right: MeteringIdentity;
}): boolean =>
	left.orgId === right.orgId &&
	left.env === right.env &&
	left.customerId === right.customerId;

export const balanceOf = ({
	feature,
}: {
	feature: DirectMeteredV1FeatureState;
}): number =>
	feature.buckets
		.reduce((total, bucket) => total.plus(bucket.balance), new Decimal(0))
		.toNumber();

export const availableBalanceOf = ({
	feature,
}: {
	feature: DirectMeteredV1FeatureState;
}): Decimal =>
	feature.buckets.reduce(
		(total, bucket) => total.plus(Decimal.max(bucket.balance, 0)),
		new Decimal(0),
	);
