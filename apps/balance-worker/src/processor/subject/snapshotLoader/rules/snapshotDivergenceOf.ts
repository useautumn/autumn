import {
	canonicalizeJsonValue,
	type JsonValue,
	type SubjectState,
} from "@autumn/balance-engine";

const fieldsCompared = (state: SubjectState) =>
	(Object.keys(state) as (keyof SubjectState)[]).filter(
		(field) => field !== "revision",
	);

const fingerprintOf = (value: unknown) =>
	JSON.stringify(canonicalizeJsonValue(value as JsonValue));

export const snapshotDivergenceOf = ({
	snapshot,
	baseline,
}: {
	snapshot: SubjectState;
	baseline: SubjectState;
}): (keyof SubjectState)[] =>
	fieldsCompared(baseline).filter(
		(field) =>
			fingerprintOf(snapshot[field]) !== fingerprintOf(baseline[field]),
	);
