import type { AutumnLogger } from "@autumn/logging";

const UNKNOWN_KEYS_LOG_EVERY_MS = 60_000;

/** Where commands carrying keys this worker does not know arrive from, logged once a minute per source and key set. */
export type UnknownKeysLog = {
	record(params: { source: string; keyPaths: string[] }): void;
};

type LoggedKeys = { loggedAt: number; repeats: number };

/** Version skew made visible but never loud: an unknown key is dropped, not an error, so this is info. */
export function createUnknownKeysLog({
	ctx,
	config = { everyMs: UNKNOWN_KEYS_LOG_EVERY_MS },
}: {
	ctx: { logger?: Pick<AutumnLogger, "info">; now?: () => number };
	config?: { everyMs: number };
}): UnknownKeysLog {
	const logged = new Map<string, LoggedKeys>();

	function record({
		source,
		keyPaths,
	}: {
		source: string;
		keyPaths: string[];
	}): void {
		const key = `${source} ${keyPaths.join(",")}`;
		const now = (ctx.now ?? Date.now)();
		const last = logged.get(key);
		if (last && now - last.loggedAt < config.everyMs) {
			last.repeats += 1;
			return;
		}
		logged.set(key, { loggedAt: now, repeats: 0 });
		ctx.logger?.info(
			{
				event: "balance_worker.unknown_keys_stripped",
				source,
				keyPaths,
				repeatsSinceLastLine: last?.repeats ?? 0,
			},
			"Unknown command keys stripped",
		);
	}

	return { record };
}
