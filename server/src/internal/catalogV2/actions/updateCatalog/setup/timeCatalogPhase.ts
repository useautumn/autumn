import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { addToExtraLogs } from "@/utils/logging/addToExtraLogs";

export type CatalogPhases = Record<string, number>;

export const timeCatalogPhase = async <T>({
	ctx,
	phases,
	phase,
	run,
}: {
	ctx: AutumnContext;
	phases: CatalogPhases;
	phase: string;
	run: () => Promise<T>;
}): Promise<T> => {
	const started = Date.now();
	try {
		return await run();
	} finally {
		const ms = Date.now() - started;
		phases[phase] = (phases[phase] ?? 0) + ms;
		const existing = ctx.extraLogs.catalogTiming;
		const catalogTiming =
			existing && typeof existing === "object" && !Array.isArray(existing)
				? existing
				: {};
		const existingPhases =
			"phases" in catalogTiming &&
			catalogTiming.phases &&
			typeof catalogTiming.phases === "object" &&
			!Array.isArray(catalogTiming.phases)
				? catalogTiming.phases
				: {};

		addToExtraLogs({
			ctx,
			extras: {
				catalogTiming: {
					...catalogTiming,
					phases: { ...existingPhases, ...phases },
				},
			},
		});
	}
};
