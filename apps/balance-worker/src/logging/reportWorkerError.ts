import type { AutumnLogger } from "@autumn/logging";
import { partitionLifecycleEventOf } from "../partitions/lifecycle/partitionLifecycleErrors.js";
import { errorCauseChain } from "./errorCauseChain.js";

/** One line per failure, with the cause chain in the message: `data` is hidden
 *  from the local terminal, and the root cause is what matters. A failure that
 *  is only the partition lifecycle at work is information, not an error, so a
 *  deploy's worth of hand-offs does not bury the failures that need reading. */
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
