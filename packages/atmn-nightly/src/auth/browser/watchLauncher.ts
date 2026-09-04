/** Anything with node's `once`; a spawned `ChildProcess` satisfies it. */
export type Launcher = {
	once(event: string, listener: (...args: unknown[]) => void): unknown;
};

/**
 * How long to keep watching before treating a still-running launcher as a
 * success — some openers stay resident for the life of the browser.
 */
export const LAUNCHER_SETTLE_MS = 1500;

/**
 * A launcher that never spawned (no xdg-open) or exited non-zero (no display,
 * no default browser) opened nothing. This, not a TTY check, is what tells us
 * the environment is headless.
 */
export const watchLauncher = ({
	launcher,
	settleMs = LAUNCHER_SETTLE_MS,
}: {
	launcher: Launcher;
	settleMs?: number;
}): Promise<void> =>
	new Promise((resolve, reject) => {
		const settled = setTimeout(resolve, settleMs);

		launcher.once("error", (...args: unknown[]) => {
			clearTimeout(settled);
			const [cause] = args;
			reject(
				cause instanceof Error
					? cause
					: new Error("Browser launcher failed to start"),
			);
		});

		launcher.once("close", (...args: unknown[]) => {
			clearTimeout(settled);
			const [code] = args;
			if (typeof code === "number" && code !== 0) {
				reject(new Error(`Browser launcher exited with code ${code}`));
				return;
			}
			resolve();
		});
	});
