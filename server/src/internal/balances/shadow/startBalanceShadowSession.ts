import type {
	BalanceShadowConfig,
	BalanceShadowDependencies,
} from "./balanceShadowTypes.js";
import { createBalanceShadow } from "./createBalanceShadow.js";

export function startBalanceShadowSession({
	config,
	dependencies,
}: {
	config: BalanceShadowConfig;
	dependencies: BalanceShadowDependencies & {
		owners: { start(): Promise<void>; stop(): Promise<void> };
	};
}) {
	let ready = false;
	let stopped = false;
	let stopping: Promise<void> | undefined;
	const mirror = createBalanceShadow({
		dependencies: {
			...dependencies,
			client: {
				track: (request) => {
					if (!ready) throw new Error("Shadow ownership is not ready");
					return dependencies.client.track(request);
				},
			},
		},
	});
	const summary = setInterval(
		() => mirror.record({ event: "summary", ready, ...mirror.status() }),
		10_000,
	);
	const expiry = setTimeout(
		() => {
			mirror.record({ event: "window_expired" });
			void stop();
		},
		Math.max(0, config.expiresAt - Date.now()),
	);
	summary.unref();
	expiry.unref();

	function stop(): Promise<void> {
		if (stopping) return stopping;
		stopped = true;
		ready = false;
		clearInterval(summary);
		clearTimeout(expiry);
		stopping = (async () => {
			const settled = Promise.allSettled([
				mirror.stop(),
				Promise.resolve().then(() => dependencies.owners.stop()),
			]).then((results) => {
				for (const result of results)
					if (result.status === "rejected") {
						mirror.record({
							event: "shutdown_failed",
							reason: String(result.reason),
						});
					}
			});
			let timer: ReturnType<typeof setTimeout> | undefined;
			try {
				await Promise.race([
					settled,
					new Promise<void>((resolve) => {
						timer = setTimeout(() => {
							mirror.record({ event: "shutdown_timeout", ...mirror.status() });
							resolve();
						}, 3_000);
					}),
				]);
			} finally {
				clearTimeout(timer);
			}
		})();
		return stopping;
	}

	mirror.record({ event: "starting" });
	void Promise.resolve()
		.then(() => {
			if (!stopped) return dependencies.owners.start();
		})
		.then(() => {
			if (stopped) return;
			ready = true;
			mirror.record({ event: "ready" });
		})
		.catch((error: unknown) => {
			mirror.record({
				event: "startup_failed",
				reason: error instanceof Error ? error.message : "unknown_failure",
			});
			void stop();
		});
	return { config, mirror, stop };
}
