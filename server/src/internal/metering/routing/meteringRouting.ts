import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type {
	MeteringRoutingConfig,
	MeteringRoutingMode,
} from "@/internal/misc/meteringRouting/meteringRoutingSchemas.js";
import { getMeteringRoutingConfig } from "@/internal/misc/meteringRouting/meteringRoutingStore.js";

export type MeteringRouting = {
	mode: MeteringRoutingMode;
	/** `null` whenever the mode is not a routing one, so a caller that has a
	 *  URL in hand also knows it is allowed to use it. */
	workerUrl: string | null;
};

const OFF: MeteringRouting = { mode: "off", workerUrl: null };

/** Absent env var means routing is impossible no matter what the edge config
 *  says: this is the deploy-level half of the two-key gate. */
export const readMeteringWorkerUrl = ({
	env = process.env,
}: {
	env?: Record<string, string | undefined>;
} = {}): string | null => {
	const raw = env.METERING_WORKER_URL?.trim();
	if (!raw) return null;
	return raw.replace(/\/+$/, "");
};

export const resolveMeteringRoutingMode = ({
	config,
	orgId,
	orgSlug,
}: {
	config: MeteringRoutingConfig;
	orgId: string;
	orgSlug?: string;
}): MeteringRoutingMode =>
	config.orgModes[orgId] ??
	(orgSlug ? config.orgModes[orgSlug] : undefined) ??
	config.defaultMode;

/** `serve_reads` and `full` both answer check from the worker. */
export const routesChecks = ({
	mode,
}: {
	mode: MeteringRoutingMode;
}): boolean => mode === "serve_reads" || mode === "full";

/** Only `full` lets the worker own the write. */
export const routesTracks = ({
	mode,
}: {
	mode: MeteringRoutingMode;
}): boolean => mode === "full";

/**
 * The one place check and track ask "does this request go to the worker?".
 * Returns `off` unless BOTH the deploy carries `METERING_WORKER_URL` and the
 * `metering-routing` edge config puts this org into a routing mode, so a
 * deploy with neither behaves exactly as it did before routing existed.
 */
export const resolveMeteringRouting = ({
	ctx,
	config = getMeteringRoutingConfig(),
	workerUrl = readMeteringWorkerUrl(),
}: {
	ctx: AutumnContext;
	config?: MeteringRoutingConfig;
	workerUrl?: string | null;
}): MeteringRouting => {
	if (!workerUrl) return OFF;

	const mode = resolveMeteringRoutingMode({
		config,
		orgId: ctx.org.id,
		orgSlug: ctx.org.slug,
	});
	if (mode === "off" || mode === "shadow") return { mode, workerUrl: null };

	return { mode, workerUrl };
};
