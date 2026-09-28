import { describe, expect, test } from "bun:test";
import {
	describeSlotGate,
	isActiveSlot,
} from "../../../src/blueGreen/isActiveSlot.js";

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
	updatedAt: new Date(0).toISOString(),
});

describe("blue-green slot gate", () => {
	test("fails open without an ECS identity: local and tests run as before", () => {
		const identity = { serviceArn: null, imageSha: null };
		expect(
			isActiveSlot({
				identity,
				config: record({ flightcontrolBlueArn: theirs }),
			}),
		).toBe(true);
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
			isActiveSlot({
				identity,
				config: record({ flightcontrolBlueArn: null }),
			}),
		).toBe(true);
		expect(
			describeSlotGate({
				identity,
				config: record({ flightcontrolBlueArn: null }),
			}),
		).toEqual({ active: true, reason: "no-active-record" });
		expect(
			isActiveSlot({
				identity,
				config: {
					activeTaskDefinitionArn: null,
					activeImageSha: null,
					updatedAt: new Date(0).toISOString(),
				},
			}),
		).toBe(true);
	});

	test("active when the record names this service", () => {
		const identity = { serviceArn: ours, imageSha: "abc" };
		expect(
			isActiveSlot({
				identity,
				config: record({ flightcontrolBlueArn: ours }),
			}),
		).toBe(true);
		expect(
			describeSlotGate({
				identity,
				config: record({ flightcontrolBlueArn: ours }),
			}),
		).toEqual({ active: true, reason: "active" });
	});

	test("holds only on an explicit mismatch", () => {
		const identity = { serviceArn: ours, imageSha: null };
		expect(
			isActiveSlot({
				identity,
				config: record({ flightcontrolBlueArn: theirs }),
			}),
		).toBe(false);
		expect(
			describeSlotGate({
				identity,
				config: record({ flightcontrolBlueArn: theirs }),
			}),
		).toEqual({ active: false, reason: "idle", expectedServiceArn: theirs });
	});
});
