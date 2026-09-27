import { parseBalanceShadowEdgeConfig } from "./balanceShadowEdgeConfig.js";
import type { BalanceShadowConfig } from "./balanceShadowTypes.js";
import type { BalanceShadowSession } from "./runWithBalanceShadow.js";

export type ManagedBalanceShadowSession = BalanceShadowSession & {
	stop(): Promise<void>;
	isStopped(): boolean;
};

export function createBalanceShadowController({
	readConfig,
	runtimeEnv,
	startSession,
	report,
}: {
	readConfig(): unknown;
	runtimeEnv: Record<string, string | undefined>;
	startSession(options: {
		config: BalanceShadowConfig;
	}): ManagedBalanceShadowSession;
	report(error: unknown): void;
}) {
	let started = false;
	let stopped = false;
	let generation = 0;
	let desiredKey: string | undefined;
	let session: ManagedBalanceShadowSession | undefined;
	let pending: Promise<void> | undefined;
	let stopping: Promise<void> | undefined;

	function reportFailure({ error }: { error: unknown }): void {
		try {
			report(error);
		} catch {
			// Shadow configuration and logging failures must not affect live serving.
		}
	}

	async function settle({ jobs }: { jobs: (Promise<void> | undefined)[] }) {
		const results = await Promise.allSettled(jobs);
		for (const result of results)
			if (result.status === "rejected") reportFailure({ error: result.reason });
	}

	async function applyConfig({
		config,
		currentGeneration,
		jobs,
	}: {
		config: BalanceShadowConfig | undefined;
		currentGeneration: number;
		jobs: (Promise<void> | undefined)[];
	}): Promise<void> {
		try {
			await settle({ jobs });
			if (stopped || generation !== currentGeneration || !config) return;
			if (config.expiresAt <= Date.now()) return;
			session = startSession({ config });
		} catch (error) {
			reportFailure({ error });
		} finally {
			if (generation === currentGeneration) pending = undefined;
		}
	}

	function stopCurrentSession(): Promise<void> {
		const previous = session;
		session = undefined;
		try {
			return previous?.stop() ?? Promise.resolve();
		} catch (error) {
			reportFailure({ error });
			return Promise.resolve();
		}
	}

	function refresh(): Promise<void> {
		if (!started || stopped) return Promise.resolve();
		let config: BalanceShadowConfig | undefined;
		try {
			config = parseBalanceShadowEdgeConfig({
				input: readConfig(),
				runtimeEnv,
			});
		} catch (error) {
			reportFailure({ error });
		}
		const key = config ? JSON.stringify(config) : undefined;
		if (
			key === desiredKey &&
			(pending || !config || (session && !session.isStopped()))
		)
			return pending ?? Promise.resolve();
		desiredKey = key;
		const currentGeneration = ++generation;
		const previous = stopCurrentSession();
		pending = applyConfig({
			config,
			currentGeneration,
			jobs: [pending, previous],
		});
		return pending;
	}

	function start(): void {
		if (started || stopped) return;
		started = true;
		void refresh();
	}

	function stop(): Promise<void> {
		if (stopping) return stopping;
		stopped = true;
		generation++;
		stopping = settle({ jobs: [pending, stopCurrentSession()] });
		return stopping;
	}

	return {
		start,
		refresh,
		getSession: (): BalanceShadowSession | undefined =>
			session && !session.isStopped() && session.config.expiresAt > Date.now()
				? session
				: undefined,
		stop,
	};
}
