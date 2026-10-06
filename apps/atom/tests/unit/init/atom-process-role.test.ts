import { describe, expect, test } from "bun:test";
import { createAtomEnv } from "@autumn/env/atom";
import { atomProcessRole } from "../../../src/init/atomProcessRole.js";

const TOKEN_HASH = "a".repeat(64);

const envWith = ({
	processes,
	linked,
}: {
	processes: number;
	linked: boolean;
}) =>
	createAtomEnv({
		ATOM_TOKEN_HASH: TOKEN_HASH,
		ATOM_PROCESSES: String(processes),
		...(linked && { ALIEN_PUSHES_BINDING: "{}" }),
	});

describe("an Atom process's role", () => {
	test("every child serves; the first ATOM_WRITERS also receive pushes", () => {
		const env = envWith({ processes: 8, linked: true });
		const roles = [...Array(8).keys()].map((childIndex) =>
			atomProcessRole({ env, childIndex }),
		);

		expect(roles.map((role) => role.receivesPushes)).toEqual([
			true,
			true,
			false,
			false,
			false,
			false,
			false,
			false,
		]);
	});

	test("a lone process receives when the push queue is linked", () => {
		const withQueue = envWith({ processes: 1, linked: true });
		const without = envWith({ processes: 1, linked: false });

		expect(atomProcessRole({ env: withQueue, childIndex: null })).toEqual({
			receivesPushes: true,
		});
		expect(atomProcessRole({ env: without, childIndex: null })).toEqual({
			receivesPushes: false,
		});
	});

	test("with no push queue no child receives", () => {
		const env = envWith({ processes: 4, linked: false });

		expect(atomProcessRole({ env, childIndex: 0 })).toEqual({
			receivesPushes: false,
		});
	});

	test("a multi-tenant Atom with its queue linked receives on two children of eight", () => {
		const env = createAtomEnv(
			{
				ATOM_MODE: "multi_tenant",
				ATOM_TOKEN_HASH: TOKEN_HASH,
				ALIEN_PUSHES_BINDING: "{}",
			},
			{ availableCpus: 8, memoryLimitBytes: 16 * 1024 ** 3 },
		);
		const roles = [...Array(env.ATOM_PROCESSES).keys()].map((childIndex) =>
			atomProcessRole({ env, childIndex }),
		);

		expect(env.ATOM_PROCESSES).toBe(8);
		expect(roles.filter((role) => role.receivesPushes)).toHaveLength(2);
	});
});
