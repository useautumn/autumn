import { describe, expect, test } from "bun:test";
import { createAtomSupervisor } from "../../../src/init/createAtomSupervisor.js";
import type { AtomChild } from "../../../src/init/types/atomSupervisor.js";

/** A child process the test ends by hand. */
const createFakeChildren = () => {
	const spawned: { index: number; signals: string[]; exit(): void }[] = [];
	const spawnChild = ({ index }: { index: number }): AtomChild => {
		const exited = Promise.withResolvers<void>();
		const child = { index, signals: [] as string[], exit: exited.resolve };
		spawned.push(child);
		return {
			exited: exited.promise,
			kill: (signal) => {
				child.signals.push(signal);
				// A child asked to stop does.
				exited.resolve();
			},
		};
	};
	return { spawned, spawnChild };
};

const createSupervisor = ({ processes }: { processes: number }) => {
	const { spawned, spawnChild } = createFakeChildren();
	const logged: unknown[] = [];
	const supervisor = createAtomSupervisor({
		ctx: {
			spawnChild,
			logger: {
				info: () => undefined,
				warn: (...args: unknown[]) => void logged.push(args),
				error: () => undefined,
			},
		},
		config: { processes, restartDelayMs: 0 },
	});
	return { supervisor, spawned, logged };
};

/** Lets a child's exit be noticed and its replacement started. */
const settle = () => Bun.sleep(5);

describe("the Atom supervisor", () => {
	test("starts one child per process it was told to run", async () => {
		const { supervisor, spawned } = createSupervisor({ processes: 3 });

		await supervisor.start();

		expect(spawned.map((child) => child.index)).toEqual([0, 1, 2]);
	});

	test("replaces a child that dies, in the same place", async () => {
		const { supervisor, spawned, logged } = createSupervisor({ processes: 2 });
		await supervisor.start();

		spawned[1]?.exit();
		await settle();

		expect(spawned.map((child) => child.index)).toEqual([0, 1, 1]);
		expect(logged).toHaveLength(1);
	});

	test("stopping asks every child to stop and waits for them", async () => {
		const { supervisor, spawned } = createSupervisor({ processes: 2 });
		await supervisor.start();

		await supervisor.stop();

		expect(spawned.map((child) => child.signals)).toEqual([
			["SIGTERM"],
			["SIGTERM"],
		]);
	});

	test("a child that stops because it was asked to is not replaced", async () => {
		const { supervisor, spawned } = createSupervisor({ processes: 2 });
		await supervisor.start();

		await supervisor.stop();
		await settle();

		expect(spawned).toHaveLength(2);
	});
});
