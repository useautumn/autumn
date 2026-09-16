import {
	type CheckCommand,
	type CheckDecision,
	computeCheck,
	type MeteringIdentity,
	meteringPartitionKeyOf,
	parseCheckCommand,
	parseTrackCommand,
	type TrackCommand,
	type TrackDecision,
} from "@autumn/balance-engine";
import { submitTrack as submitTrackMutation } from "../../processor/commands/track.js";
import { PartitionWriterRecoveryRequiredError } from "../../processor/writer/writerErrors.js";
import { assertRuntimeReady } from "../getRuntimeHealth.js";
import { enterRuntimeRecovery } from "../lifecycle/enterRuntimeRecovery.js";
import {
	OwnedPartitionMismatchError,
	OwnedPartitionProducerFencedError,
	OwnedPartitionStateNotFoundError,
} from "../runtimeErrors.js";
import type { PartitionRuntimeContext } from "../types/partitionRuntime.js";
import type { PartitionRuntimeScope } from "../types/partitionRuntimeState.js";

export async function submitRuntimeTrack({
	ctx,
	state,
	command,
}: PartitionRuntimeScope & { command: TrackCommand }): Promise<TrackDecision> {
	assertRuntimeReady({ state });
	const parsedCommand = parseTrackCommand({ input: command });
	const customerKey = assertCommandPartition({
		ctx,
		commandIdentity: parsedCommand.identity,
	});
	const operation = writeRuntimeTrack({ ctx, state, command: parsedCommand });
	return ctx.requestTracker.registerTrack({ customerKey, operation });
}

export async function checkRuntimeBalance({
	ctx,
	state,
	command,
}: PartitionRuntimeScope & { command: CheckCommand }): Promise<CheckDecision> {
	assertRuntimeReady({ state });
	const parsedCommand = parseCheckCommand({ input: command });
	const customerKey = assertCommandPartition({
		ctx,
		commandIdentity: parsedCommand.identity,
	});
	const precedingTracks = ctx.requestTracker.precedingTracks({ customerKey });
	const operation = readRuntimeBalance({
		ctx,
		state,
		command: parsedCommand,
		customerKey,
		precedingTracks,
	});
	return ctx.requestTracker.register({ operation });
}

async function writeRuntimeTrack({
	ctx,
	state,
	command,
}: PartitionRuntimeScope & { command: TrackCommand }): Promise<TrackDecision> {
	try {
		return await submitTrackMutation({
			writer: ctx.writer,
			command,
			receiptPolicy: ctx.trackReceiptPolicy,
		});
	} catch (cause) {
		if (state.terminalError) throw state.terminalError;
		if (
			cause instanceof PartitionWriterRecoveryRequiredError ||
			cause instanceof OwnedPartitionProducerFencedError
		) {
			throw await enterRuntimeRecovery({ ctx, state, cause });
		}
		throw cause;
	}
}

async function readRuntimeBalance({
	ctx,
	state,
	command,
	customerKey,
	precedingTracks,
}: PartitionRuntimeScope & {
	command: CheckCommand;
	customerKey: string;
	precedingTracks: Promise<TrackDecision>[];
}): Promise<CheckDecision> {
	if (precedingTracks.length > 0) {
		await Promise.allSettled(precedingTracks);
		if (state.terminalError) throw state.terminalError;
	}
	const customerState = ctx.stateStore.readState({
		identity: command.identity,
	});
	if (!customerState)
		throw new OwnedPartitionStateNotFoundError({ customerKey });
	return computeCheck({ state: customerState, command });
}

function assertCommandPartition({
	ctx,
	commandIdentity,
}: {
	ctx: PartitionRuntimeContext;
	commandIdentity: MeteringIdentity;
}): string {
	const actualPartition = ctx.partitionResolver.partitionForIdentity({
		identity: commandIdentity,
	});
	if (!Number.isSafeInteger(actualPartition) || actualPartition < 0) {
		throw new RangeError(
			`Partition resolver returned an invalid partition: ${actualPartition}`,
		);
	}
	const customerKey = meteringPartitionKeyOf({ identity: commandIdentity });
	if (actualPartition !== ctx.config.partition) {
		throw new OwnedPartitionMismatchError({
			customerKey,
			expectedPartition: ctx.config.partition,
			actualPartition,
		});
	}
	return customerKey;
}
