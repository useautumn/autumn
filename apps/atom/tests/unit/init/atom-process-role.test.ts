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
	test("the first ATOM_WRITERS children receive pushes and never serve; the rest serve", () => {
		const env = envWith({ processes: 8, linked: true });
		const roles = [...Array(8).keys()].map((childIndex) =>
			atomProcessRole({ env, childIndex }),
		);

		expect(roles.filter((role) => role.receivesPushes)).toHaveLength(2);
		expect(roles.slice(0, 2)).toEqual([
			{ servesChecks: false, receivesPushes: true },
			{ servesChecks: false, receivesPushes: true },
		]);
		expect(
			roles.slice(2).every((role) => role.servesChecks && !role.receivesPushes),
		).toBe(true);
	});

	test("a lone process serves, and receives when the push queue is linked", () => {
		const withQueue = envWith({ processes: 1, linked: true });
		const without = envWith({ processes: 1, linked: false });

		expect(atomProcessRole({ env: withQueue, childIndex: null })).toEqual({
			servesChecks: true,
			receivesPushes: true,
		});
		expect(atomProcessRole({ env: without, childIndex: null })).toEqual({
			servesChecks: true,
			receivesPushes: false,
		});
	});

	test("with no push queue every child serves", () => {
		const env = envWith({ processes: 4, linked: false });

		expect(atomProcessRole({ env, childIndex: 0 })).toEqual({
			servesChecks: true,
			receivesPushes: false,
		});
	});
});
