import { describe, expect, test } from "bun:test";
import { parseTrackCommand } from "../../../src/balanceEngine.js";
import { createTrackCommand } from "../engineFixtures.js";

const fromNewerServer = () => {
	const command = JSON.parse(JSON.stringify(createTrackCommand()));
	command.futureField = true;
	command.usageEvent.futureField = true;
	return command;
};

describe("a track command from a newer server", () => {
	test("parses, keeping the fields this build does not know", () => {
		const command = fromNewerServer();
		expect(parseTrackCommand({ input: command })).toEqual(command);
	});
});
