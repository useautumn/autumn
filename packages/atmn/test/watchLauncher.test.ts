/**
 * The behavioural half of headless detection. Every case here is one a TTY
 * check gets wrong: a container, an SSH session and CI all have terminals.
 */

import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { watchLauncher } from "../src/auth/browser/watchLauncher";

const SETTLE_MS = 20;

const launcherThat = ({
	emit,
}: {
	emit: (launcher: EventEmitter) => void;
}): EventEmitter => {
	const launcher = new EventEmitter();
	setTimeout(() => emit(launcher), 1);
	return launcher;
};

test("a launcher that exits cleanly opened a browser", async () => {
	const launcher = launcherThat({
		emit: (emitter) => emitter.emit("close", 0),
	});

	await expect(
		watchLauncher({ launcher, settleMs: SETTLE_MS }),
	).resolves.toBeUndefined();
});

test("a launcher that exits non-zero opened nothing", async () => {
	// xdg-open with no display exits 3, whatever the terminal looks like.
	const launcher = launcherThat({
		emit: (emitter) => emitter.emit("close", 3),
	});

	await expect(
		watchLauncher({ launcher, settleMs: SETTLE_MS }),
	).rejects.toThrow(/exited with code 3/);
});

test("a launcher that never spawned opened nothing", async () => {
	const launcher = launcherThat({
		emit: (emitter) =>
			emitter.emit("error", new Error("spawn xdg-open ENOENT")),
	});

	await expect(
		watchLauncher({ launcher, settleMs: SETTLE_MS }),
	).rejects.toThrow(/ENOENT/);
});

test("a launcher still running after the settle window counts as opened", async () => {
	// Some openers stay resident for the life of the browser they launched.
	const launcher = new EventEmitter();

	await expect(
		watchLauncher({ launcher, settleMs: SETTLE_MS }),
	).resolves.toBeUndefined();
});
