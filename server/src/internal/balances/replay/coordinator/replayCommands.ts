import {
	type CatalogRow,
	type CheckCommand,
	type InitializeCommand,
	parseCheckCommand,
	parseInitializeCommand,
	parseTrackCommand,
	type SubjectState,
	type TrackCommand,
} from "@autumn/balance-engine";
import { ReplayHydrationInvalidSelectionError } from "../replayHydrationErrors.js";
import {
	commandIdOf,
	identitiesEqual,
	type NormalizedSelection,
} from "./replaySelection.js";

function deepFreeze<Value>(value: Value): Readonly<Value> {
	if (typeof value !== "object" || value === null || Object.isFrozen(value))
		return value;
	for (const nested of Object.values(value)) deepFreeze(nested);
	return Object.freeze(value);
}

export function assertCommandMatchesSelection({
	command,
	selection,
}: {
	command: CheckCommand | TrackCommand;
	selection: NormalizedSelection;
}): void {
	if (!identitiesEqual({ left: command.identity, right: selection.identity })) {
		throw new ReplayHydrationInvalidSelectionError({
			reason: "command identity does not match selection",
		});
	}
	if (!selection.featureIds.includes(command.featureId)) {
		throw new ReplayHydrationInvalidSelectionError({
			reason: "command feature is not selected",
		});
	}
}

export function freezeCheckCommand({
	command,
}: {
	command: CheckCommand;
}): CheckCommand {
	return deepFreeze(
		parseCheckCommand({ input: structuredClone(command) }),
	) as CheckCommand;
}

export function freezeTrackCommand({
	command,
}: {
	command: TrackCommand;
}): TrackCommand {
	return deepFreeze(
		parseTrackCommand({ input: structuredClone(command) }),
	) as TrackCommand;
}

export function buildProbeCommand({
	selection,
}: {
	selection: NormalizedSelection;
}): CheckCommand {
	return parseCheckCommand({
		input: {
			schemaVersion: 1,
			type: "check",
			requestId: `${commandIdOf({ selection })}:probe`,
			identity: selection.identity,
			featureId: selection.featureIds[0],
			requiredBalance: 0,
			properties: null,
			occurredAt: selection.baseline.capturedAtMs,
		},
	});
}

export function buildInitializeCommand({
	selection,
	state,
	catalogRows,
}: {
	selection: NormalizedSelection;
	state: SubjectState;
	catalogRows: CatalogRow[];
}): InitializeCommand {
	const commandId = commandIdOf({ selection });
	return deepFreeze(
		parseInitializeCommand({
			input: {
				schemaVersion: 1,
				type: "initialize",
				commandId,
				requestId: `${commandId}:initialize`,
				identity: selection.identity,
				state,
				catalogRows,
				occurredAt: selection.baseline.capturedAtMs,
			},
		}),
	) as InitializeCommand;
}
