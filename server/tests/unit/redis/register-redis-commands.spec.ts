import { describe, expect, test } from "bun:test";
import { registerRedisCommands } from "@/external/redis/initUtils/registerRedisCommands.js";

type RegisteredCommand = {
	lua: string;
	numberOfKeys?: number;
};

const expectedCommands = new Set([
	"deductFromSubjectBalances",
	"updateSubjectBalances",
	"setCachedFullSubject",
	"updateFullSubjectCustomerDataV2",
	"updateFullSubjectEntityDataV2",
	"updateFullSubjectCustomerProductV2",
	"upsertInvoiceInFullSubjectV2",
	"adjustSubjectBalance",
	"rollUsageWindows",
	"getDelFullSubjectBalanceFields",
]);

const registerCommands = () => {
	const commands = new Map<string, RegisteredCommand>();
	const redis = {
		defineCommand: (name: string, command: RegisteredCommand) => {
			commands.set(name, command);
		},
		on: () => undefined,
	};

	registerRedisCommands({ redisInstance: redis as never });

	return commands;
};

describe("registerRedisCommands", () => {
	test("registers exactly the FullSubject (V2) commands", () => {
		const commands = registerCommands();
		expect(new Set(commands.keys())).toEqual(expectedCommands);
	});

	test("registers scripts without provider-specific shebangs", () => {
		const commands = registerCommands();
		for (const [name, { lua }] of commands) {
			expect(lua.startsWith("#!"), name).toBe(false);
			expect(lua.length, name).toBeGreaterThan(0);
		}
	});
});
