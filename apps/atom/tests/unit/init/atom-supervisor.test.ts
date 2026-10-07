import { describe, expect, test } from "bun:test";
import { createAtomSupervisor } from "../../../src/init/createAtomSupervisor.js";
import type { AtomChild } from "../../../src/init/types/atomSupervisor.js";

/** Which spawn attempts throw instead of starting a child. */
type SpawnFailing = (params: { index: number; attempt: number }) => boolean;

/** A child process the test ends by hand. */
const createFakeChildren = ({
	failing = () => false,
}: {
	failing?: SpawnFailing;
} = {}) => {
	const spawned: { index: number; signals: string[]; exit(): void }[] = [];
	const attempts = new Map<number, number>();
	const spawnChild = ({ index }: { index: number }): AtomChild => {
		const attempt = (attempts.get(index) ?? 0) + 1;
		attempts.set(index, attempt);
		if (failing({ index, attempt }))
			throw new Error(`spawn of child ${index} failed`);
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

const createSupervisor = ({
	processes,
	failing,
}: {
	processes: number;
	failing?: SpawnFailing;
}) => {
	const { spawned, spawnChild } = createFakeChildren({ failing });
	const logged: unknown[] = [];
	const errors: unknown[] = [];
	const restarts: number[] = [];
	const supervisor = createAtomSupervisor({
		ctx: {
			spawnChild,
			recordRestarts: ({ restarts: total }) => void restarts.push(total),
			logger: {
				info: () => undefined,
				warn: (...args: unknown[]) => void logged.push(args),
				error: (...args: unknown[]) => void errors.push(args),
			},
		},
		config: { processes, restartDelayMs: 0 },
	});
	return { supervisor, spawned, logged, errors, restarts };
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

	test("counts each replacement since boot", async () => {
		const { supervisor, spawned, restarts } = createSupervisor({
			processes: 2,
		});
		await supervisor.start();

		spawned[1]?.exit();
		await settle();
		spawned[0]?.exit();
		await settle();

		expect(restarts).toEqual([1, 2]);
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

	test("a child that cannot be started at startup takes the started ones down with it", async () => {
		const { supervisor, spawned } = createSupervisor({
			processes: 3,
			failing: ({ index }) => index === 2,
		});

		await expect(supervisor.start()).rejects.toThrow("spawn of child 2");

		expect(spawned.map((child) => child.signals)).toEqual([
			["SIGTERM"],
			["SIGTERM"],
		]);
	});

	test("a replacement that cannot be started is tried again", async () => {
		const { supervisor, spawned, errors } = createSupervisor({
			processes: 2,
			failing: ({ index, attempt }) => index === 1 && attempt === 2,
		});
		await supervisor.start();

		spawned[1]?.exit();
		await settle();

		expect(spawned.map((child) => child.index)).toEqual([0, 1, 1]);
		expect(errors).toHaveLength(1);
	});

	test("a child that stops because it was asked to is not replaced", async () => {
		const { supervisor, spawned } = createSupervisor({ processes: 2 });
		await supervisor.start();

		await supervisor.stop();
		await settle();

		expect(spawned).toHaveLength(2);
	});
});
