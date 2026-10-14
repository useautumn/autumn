import type { AutumnLogger } from "@autumn/logging";
import { partitionLifecycleEventOf } from "../partitions/lifecycle/partitionLifecycleErrors.js";
import { errorCauseChain } from "./errorCauseChain.js";

export function reportWorkerError({
	logger,
	cause,
}: {
	logger: Pick<AutumnLogger, "info" | "error">;
	cause: unknown;
}): void {
	const causes = errorCauseChain({ error: cause });
	const chain = causes.map(causeToLine).join(" <- ");
	const lifecycle = partitionLifecycleEventOf({ cause });
	if (lifecycle) {
		const summary = `Balance worker partition ${lifecycle.replace("_", " ")}`;
		logger.info(
			{ error: cause, data: { causes, lifecycle } },
			chain ? `${summary} <- ${chain}` : summary,
		);
		return;
	}
	logger.error(
		{ error: cause, data: { causes } },
		chain ? `Balance worker error <- ${chain}` : "Balance worker error",
	);
}

function causeToLine({ name, message }: { name: string; message: string }) {
	return `${name}: ${message}`;
}
