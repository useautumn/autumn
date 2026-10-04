import { stagingVariantsBound, variant } from "@autumn/edge-config";
import {
	createServerCpuSampler,
	type ServerCpuSampler,
	serverCpuTelemetryAllowed,
} from "@autumn/logging";
import { getAdminS3Config } from "@/external/aws/s3/adminS3Config.js";
import { logger } from "@/external/logtail/logtailUtils.js";

let sampler: Promise<ServerCpuSampler> | undefined;

async function createSampler() {
	const bucket = getAdminS3Config().bucket;
	const bound = stagingVariantsBound();
	if (!serverCpuTelemetryAllowed({ bucket, bound }))
		return createServerCpuSampler({ bucket, bound });
	try {
		const { getServerCpuBackend } = await import("@autumn/logging/server-cpu");
		return createServerCpuSampler({
			bucket,
			bound,
			backend: getServerCpuBackend(),
			shouldSample: () => variant("server-phase-cpu") === "B",
		});
	} catch {
		logger.warn("Server phase CPU profiler unavailable", {
			event: "server.phase_cpu.unavailable",
		});
		return createServerCpuSampler({ bucket, bound });
	}
}

export function getServerCpuSampler() {
	sampler ??= createSampler();
	return sampler;
}
