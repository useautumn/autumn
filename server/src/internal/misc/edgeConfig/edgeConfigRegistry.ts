import { ms } from "@autumn/shared";
import type { Logger } from "@/external/logtail/logtailUtils.js";
import {
	readEdgeConfigTimestamp,
	writeEdgeConfigTimestamp,
} from "./edgeConfigTimestamp.js";

type EdgeConfigLifecycle = {
	refresh: (options?: { logger?: Logger }) => Promise<void>;
};

export const createEdgeConfigRegistry = ({
	readTimestamp = readEdgeConfigTimestamp,
	writeTimestamp = writeEdgeConfigTimestamp,
	pollIntervalMs = process.env.NODE_ENV === "development"
		? ms.seconds(1)
		: ms.seconds(10),
}: {
	readTimestamp?: () => Promise<string | null>;
	writeTimestamp?: () => Promise<string>;
	pollIntervalMs?: number;
} = {}) => {
	const stores: EdgeConfigLifecycle[] = [];
	let lastTimestamp: string | null | undefined;
	let lastTimestampError: string | undefined;
	let timestampWriteAttempted = false;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let pollPromise: Promise<void> | null = null;

	const register = ({ store }: { store: EdgeConfigLifecycle }) => {
		stores.push(store);
	};

	const refreshAll = async ({ logger }: { logger?: Logger } = {}) => {
		await Promise.all(stores.map((store) => store.refresh({ logger })));
	};

	const warnTimestampError = ({
		error,
		logger,
	}: {
		error: unknown;
		logger?: Logger;
	}) => {
		const message = error instanceof Error ? error.message : String(error);
		if (message !== lastTimestampError) {
			logger?.warn(`Failed to read edge config timestamp: ${message}`);
		}
		lastTimestampError = message;
	};

	/** One create attempt per missing-key stretch: every process polls, so
	 *  retrying each tick would hammer S3 fleet-wide while the key stays absent. */
	const ensureTimestamp = async (): Promise<string | null> => {
		if (timestampWriteAttempted) return null;
		timestampWriteAttempted = true;
		return await writeTimestamp();
	};

	const checkForChanges = async ({ logger }: { logger?: Logger } = {}) => {
		try {
			const timestamp = await readTimestamp();
			lastTimestampError = undefined;
			if (timestamp !== null) timestampWriteAttempted = false;
			if (timestamp === lastTimestamp && timestamp !== null) return;

			await refreshAll({ logger });
			lastTimestamp = timestamp ?? (await ensureTimestamp());
		} catch (error) {
			warnTimestampError({ error, logger });
			await refreshAll({ logger });
		}
	};

	const start = async ({ logger }: { logger?: Logger } = {}) => {
		if (pollTimer || process.env.AUTUMN_EDGE_CONFIG_OVERRIDE_B64) {
			await refreshAll({ logger });
			return;
		}

		try {
			const timestamp = await readTimestamp();
			if (timestamp !== null) timestampWriteAttempted = false;
			lastTimestamp = timestamp ?? (await ensureTimestamp());
			lastTimestampError = undefined;
		} catch (error) {
			warnTimestampError({ error, logger });
		}
		await refreshAll({ logger });

		pollTimer = setInterval(() => {
			if (pollPromise) return;
			pollPromise = checkForChanges({ logger }).finally(() => {
				pollPromise = null;
			});
		}, pollIntervalMs);
	};

	const stop = () => {
		if (pollTimer) clearInterval(pollTimer);
		pollTimer = null;
	};

	return { register, start, stop, checkForChanges };
};

const registry = createEdgeConfigRegistry();

export const registerEdgeConfig = registry.register;
export const startAllEdgeConfigPolling = registry.start;
export const stopAllEdgeConfigPolling = registry.stop;
