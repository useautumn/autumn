import { describe, expect, test } from "bun:test";
import { UPSTASH_KEY_LOCKING_SHEBANG } from "@/_luaScriptsV2/luaScriptsV2.js";
import { registerRedisCommands } from "@/external/redis/initUtils/registerRedisCommands.js";

type RegisteredCommand = {
	lua: string;
	numberOfKeys?: number;
};

const upstashLockedCommands = new Set([
	"deductFromSubjectBalances",
	"updateSubjectBalances",
	"setCachedFullSubject",
	"updateFullSubjectCustomerDataV2",
	"updateFullSubjectEntityDataV2",
	"updateFullSubjectCustomerProductV2",
	"upsertInvoiceInFullSubjectV2",
	"adjustSubjectBalance",
]);

const registerCommands = (supportsUpstashShebang: boolean) => {
	const commands = new Map<string, RegisteredCommand>();
	const redis = {
		defineCommand: (name: string, command: RegisteredCommand) => {
			commands.set(name, command);
		},
		on: () => undefined,
	};

	registerRedisCommands({
		redisInstance: redis as never,
		supportsUpstashShebang,
	});

	return commands;
};

const shebangCount = (script: string) =>
	script.split(UPSTASH_KEY_LOCKING_SHEBANG).length - 1;

describe("registerRedisCommands", () => {
	test("adds the Upstash key-locking shebang only to commands that need it", () => {
		const commands = registerCommands(true);

		expect(
			[...upstashLockedCommands].filter((command) => !commands.has(command)),
		).toEqual([]);

		for (const [name, { lua }] of commands) {
			const expectedCount = upstashLockedCommands.has(name) ? 1 : 0;
			expect(shebangCount(lua), name).toBe(expectedCount);
			expect(lua.startsWith(UPSTASH_KEY_LOCKING_SHEBANG), name).toBe(
				expectedCount === 1,
			);
		}
	});

	test("does not add Upstash key-locking shebangs for non-Upstash Redis", () => {
		const commands = registerCommands(false);

		for (const [name, { lua }] of commands) {
			expect(shebangCount(lua), name).toBe(0);
			expect(lua.startsWith(UPSTASH_KEY_LOCKING_SHEBANG), name).toBe(false);
		}
	});
});
