export type BoundedWarmupResult = "warm" | "timeout" | "failed";

/** Await a warmup with a hard bound: serve warm when redis is reachable, but
 *  never let an unreachable redis block boot — fail-open covers the gap. */
export const awaitBoundedWarmup = async ({
	warmup,
	timeoutMs,
	log,
}: {
	warmup: Promise<unknown>;
	timeoutMs: number;
	log: (message: string) => void;
}): Promise<BoundedWarmupResult> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const bound = new Promise<"timeout">((resolve) => {
		timer = setTimeout(() => resolve("timeout"), timeoutMs);
		timer.unref?.();
	});

	try {
		const result = await Promise.race([
			warmup.then(
				() => "warm" as const,
				() => "failed" as const,
			),
			bound,
		]);
		if (result === "timeout") {
			log(
				`[Redis] warmup still pending after ${timeoutMs}ms; serving with fail-open`,
			);
		}
		if (result === "failed") {
			log("[Redis] warmup failed; serving with fail-open");
		}
		return result;
	} finally {
		if (timer) clearTimeout(timer);
	}
};
