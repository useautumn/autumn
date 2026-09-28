import { describe, expect, test } from "bun:test";
import {
	createEdgeConfigStore,
	type EdgeConfigS3Client,
} from "@autumn/edge-config";
import { createSlotGate } from "../../../src/blueGreen/createSlotGate.js";
import { activeSlotEdgeConfig } from "../../../src/edgeConfig/activeSlotEdgeConfig.js";

const ours = "arn:aws:ecs:us-east-2:1:service/autumn/balance-workers-green";
const theirs = "arn:aws:ecs:us-east-2:1:service/autumn/balance-workers-blue";
const record = ({
	flightcontrolBlueArn,
}: {
	flightcontrolBlueArn: string | null;
}) => ({
	activeTaskDefinitionArn: null,
	activeImageSha: null,
	flightcontrolBlueArn,
	updatedAt: new Date().toISOString(),
});
/** An S3 with one object per key, so a write lands where the next read looks. */
const createMemoryS3Client = (): EdgeConfigS3Client => {
	const objects = new Map<string, string>();
	return {
		send: async (command) => {
			const { Key, Body } = command.input as { Key?: string; Body?: string };
			if (Body !== undefined) {
				objects.set(Key ?? "", Body);
				return {};
			}
			const stored = objects.get(Key ?? "");
			if (stored === undefined) {
				const missing = new Error("NoSuchKey");
				missing.name = "NoSuchKey";
				throw missing;
			}
			return { Body: { transformToString: async () => stored } };
		},
	};
};
const createActiveSlotStore = () =>
	createEdgeConfigStore({
		ctx: {
			location: () => ({ bucket: "test", region: "us-east-2" }),
			s3Client: createMemoryS3Client(),
		},
		s3Key: activeSlotEdgeConfig.key,
		schema: activeSlotEdgeConfig.schema,
		defaultValue: activeSlotEdgeConfig.defaultValue,
	});
const settled = async (promise: Promise<unknown>) => {
	const pending = Symbol("pending");
	return (
		(await Promise.race([promise, Bun.sleep(5).then(() => pending)])) !==
		pending
	);
};

describe("awaitReadyAnnouncement from the slot gate", () => {
	test("resolves at once while active or failing open", async () => {
		const activeSlot = createActiveSlotStore();
		const failOpen = createSlotGate({
			ctx: { identity: { serviceArn: null, imageSha: null }, activeSlot },
		});
		activeSlot._setRuntimeConfigForTesting(
			record({ flightcontrolBlueArn: theirs }),
		);
		await failOpen.awaitActive({ signal: new AbortController().signal });

		const active = createSlotGate({
			ctx: { identity: { serviceArn: ours, imageSha: null }, activeSlot },
		});
		activeSlot._setRuntimeConfigForTesting(
			record({ flightcontrolBlueArn: ours }),
		);
		await active.awaitActive({ signal: new AbortController().signal });
	});

	test("holds while the record names another service and resolves on the flip", async () => {
		const activeSlot = createActiveSlotStore();
		activeSlot._setRuntimeConfigForTesting(
			record({ flightcontrolBlueArn: theirs }),
		);
		const gate = createSlotGate({
			ctx: { identity: { serviceArn: ours, imageSha: null }, activeSlot },
		});
		const waiting = gate.awaitActive({ signal: new AbortController().signal });
		expect(await settled(waiting)).toBe(false);

		// A change that still names the other fleet is not a flip.
		activeSlot._setRuntimeConfigForTesting({
			...record({ flightcontrolBlueArn: theirs }),
			reason: "still blue",
		});
		expect(await settled(waiting)).toBe(false);

		await activeSlot.writeToSource({
			config: record({ flightcontrolBlueArn: ours }),
		});
		await waiting;
	});

	test("rejects with the signal's reason when the partition is revoked mid-hold", async () => {
		const activeSlot = createActiveSlotStore();
		activeSlot._setRuntimeConfigForTesting(
			record({ flightcontrolBlueArn: theirs }),
		);
		const gate = createSlotGate({
			ctx: { identity: { serviceArn: ours, imageSha: null }, activeSlot },
		});
		const revoke = new AbortController();
		const waiting = gate.awaitActive({ signal: revoke.signal });
		const reason = new Error("Partition retired");
		revoke.abort(reason);
		await expect(waiting).rejects.toBe(reason);

		const already = new AbortController();
		already.abort(reason);
		await expect(gate.awaitActive({ signal: already.signal })).rejects.toBe(
			reason,
		);
		// Nothing left listening: a later flip wakes nobody and throws nowhere.
		activeSlot._setRuntimeConfigForTesting(
			record({ flightcontrolBlueArn: ours }),
		);
	});
});
