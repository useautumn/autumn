import { expect, test } from "bun:test";
import {
	acceptCommand,
	createAcceptedCommands,
	settleAcceptedCommands,
} from "../../../src/processor/common/acceptedCommands.js";

test("settle waits for fulfilled or rejected accepted commands", async () => {
	const accepted = createAcceptedCommands();
	const fulfilled = Promise.withResolvers<void>();
	const rejected = Promise.withResolvers<void>();
	acceptCommand({ accepted, operation: fulfilled.promise });
	acceptCommand({ accepted, operation: rejected.promise });

	let drained = false;
	async function finishDrain(): Promise<void> {
		await settleAcceptedCommands({ accepted });
		drained = true;
	}
	const draining = finishDrain();
	await Promise.resolve();
	expect(drained).toBe(false);
	fulfilled.resolve();
	rejected.reject(new Error("command rejected"));
	await draining;
	expect(drained).toBe(true);
	expect(accepted.active.size).toBe(0);
});

test("accepted command registries keep independent state", async () => {
	const first = createAcceptedCommands();
	const second = createAcceptedCommands();
	const operation = Promise.withResolvers<void>();
	expect(acceptCommand({ accepted: first, operation: operation.promise })).toBe(
		operation.promise,
	);
	await settleAcceptedCommands({ accepted: second });
	operation.resolve();
	await settleAcceptedCommands({ accepted: first });
});
