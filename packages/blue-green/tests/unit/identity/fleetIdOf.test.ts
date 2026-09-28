import { describe, expect, test } from "bun:test";
import { fleetIdOf } from "../../../src/blueGreen.js";

const blue = "arn:aws:ecs:us-east-2:123456789012:service/autumn/herald";
const green = "arn:aws:ecs:us-east-2:123456789012:service/autumn/herald-green";

describe("fleet id", () => {
	test("is a short hex digest of the service ARN, stable across calls and processes", () => {
		const id = fleetIdOf({ serviceArn: blue });
		expect(id).toMatch(/^[0-9a-f]{8}$/);
		expect(fleetIdOf({ serviceArn: blue })).toBe(id);
		expect(id).toBe(
			new Bun.CryptoHasher("sha256").update(blue).digest("hex").slice(0, 8),
		);
	});

	test("differs between the two Flightcontrol fleets of one deployment", () => {
		expect(fleetIdOf({ serviceArn: blue })).not.toBe(
			fleetIdOf({ serviceArn: green }),
		);
	});
});
