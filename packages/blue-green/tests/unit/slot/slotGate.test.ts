import { describe, expect, test } from "bun:test";
import {
	createEdgeConfigStore,
	type EdgeConfigS3Client,
} from "@autumn/edge-config";
import {
	activeSlotEdgeConfigOf,
	activeSlotKeyOf,
	createSlotGate,
	describeSlotGate,
	isActiveSlot,
} from "../../../src/blueGreen.js";

const ours = "arn:aws:ecs:us-east-2:1:service/autumn/herald-green";
const theirs = "arn:aws:ecs:us-east-2:1:service/autumn/herald";
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
export const createMemoryS3Client = (): EdgeConfigS3Client => {
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

const createActiveSlotStore = ({
	s3Client = createMemoryS3Client(),
	retainOnError = true,
}: {
	s3Client?: EdgeConfigS3Client;
	retainOnError?: boolean;
} = {}) => {
	const definition = activeSlotEdgeConfigOf({ serviceName: "herald" });
	return createEdgeConfigStore({
		ctx: {
			location: () => ({ bucket: "test", region: "us-east-2" }),
			s3Client,
		},
		s3Key: definition.key,
		schema: definition.schema,
		defaultValue: definition.defaultValue,
		retainOnError,
	});
};

const settled = async (promise: Promise<unknown>) => {
	const pending = Symbol("pending");
	return (
		(await Promise.race([promise, Bun.sleep(5).then(() => pending)])) !==
		pending
	);
};

describe("the slot record", () => {
	test("is keyed per service", () => {
		expect(activeSlotKeyOf({ serviceName: "herald" })).toBe(
			"admin/blue-green-herald-active-slot.json",
		);
		expect(activeSlotKeyOf({ serviceName: "balance-workers" })).toBe(
			"admin/blue-green-balance-workers-active-slot.json",
		);
	});
});

describe("the gate's four answers", () => {
	test("fails open without an ECS identity", () => {
		const identity = { serviceArn: null, imageSha: null };
		expect(
			describeSlotGate({
				identity,
				config: record({ flightcontrolBlueArn: theirs }),
			}),
		).toEqual({ active: true, reason: "blue-green-disabled" });
	});
	test("fails open when the record names no service", () => {
		const identity = { serviceArn: ours, imageSha: null };
		expect(
			describeSlotGate({
				identity,
				config: record({ flightcontrolBlueArn: null }),
			}),
		).toEqual({ active: true, reason: "no-active-record" });
	});
	test("active when the record names this service", () => {
		const identity = { serviceArn: ours, imageSha: "abc" };
		expect(
			isActiveSlot({
				identity,
				config: record({ flightcontrolBlueArn: ours }),
			}),
		).toBe(true);
	});
	test("holds only on an explicit mismatch", () => {
		const identity = { serviceArn: ours, imageSha: null };
		expect(
			describeSlotGate({
				identity,
				config: record({ flightcontrolBlueArn: theirs }),
			}),
		).toEqual({ active: false, reason: "idle", expectedServiceArn: theirs });
	});
});

describe("the slot gate over a store", () => {
	test("a failed poll after a good read keeps the last record, so the gate stays closed", async () => {
		let failing = false;
		const memory = createMemoryS3Client();
		const activeSlot = createActiveSlotStore({
			s3Client: {
				send: (command) => {
					if (failing) throw new Error("S3 unreachable");
					return memory.send(command);
				},
			},
		});
		await activeSlot.writeToSource({
			config: record({ flightcontrolBlueArn: theirs }),
		});
		await activeSlot.refresh();
		const gate = createSlotGate({
			ctx: { identity: { serviceArn: ours, imageSha: null }, activeSlot },
		});
		expect(gate.isActive()).toBe(false);

		failing = true;
		await activeSlot.refresh();
		expect(activeSlot.getStatus().healthy).toBe(false);
		expect(gate.isActive()).toBe(false);
	});

	test("subscribe fires once per change of answer, not per rewrite of the record", async () => {
		const activeSlot = createActiveSlotStore();
		activeSlot._setRuntimeConfigForTesting(
			record({ flightcontrolBlueArn: theirs }),
		);
		const gate = createSlotGate({
			ctx: { identity: { serviceArn: ours, imageSha: null }, activeSlot },
		});
		const answers: boolean[] = [];
		const unsubscribe = gate.subscribe((description) => {
			answers.push(description.active);
		});
		activeSlot._setRuntimeConfigForTesting({
			...record({ flightcontrolBlueArn: theirs }),
			reason: "still theirs",
		});
		activeSlot._setRuntimeConfigForTesting(
			record({ flightcontrolBlueArn: ours }),
		);
		activeSlot._setRuntimeConfigForTesting(
			record({ flightcontrolBlueArn: theirs }),
		);
		unsubscribe();
		activeSlot._setRuntimeConfigForTesting(
			record({ flightcontrolBlueArn: ours }),
		);
		expect(answers).toEqual([true, false]);
	});

	test("awaitActive holds while the record names another service and resolves on the flip", async () => {
		const activeSlot = createActiveSlotStore();
		activeSlot._setRuntimeConfigForTesting(
			record({ flightcontrolBlueArn: theirs }),
		);
		const gate = createSlotGate({
			ctx: { identity: { serviceArn: ours, imageSha: null }, activeSlot },
		});
		const waiting = gate.awaitActive({ signal: new AbortController().signal });
		expect(await settled(waiting)).toBe(false);
		await activeSlot.writeToSource({
			config: record({ flightcontrolBlueArn: ours }),
		});
		await waiting;
	});

	test("awaitActive rejects with the signal's reason when aborted mid-hold", async () => {
		const activeSlot = createActiveSlotStore();
		activeSlot._setRuntimeConfigForTesting(
			record({ flightcontrolBlueArn: theirs }),
		);
		const gate = createSlotGate({
			ctx: { identity: { serviceArn: ours, imageSha: null }, activeSlot },
		});
		const abort = new AbortController();
		const waiting = gate.awaitActive({ signal: abort.signal });
		const reason = new Error("stopping");
		abort.abort(reason);
		await expect(waiting).rejects.toBe(reason);
	});
});
