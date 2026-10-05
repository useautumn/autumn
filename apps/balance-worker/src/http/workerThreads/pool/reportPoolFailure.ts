import type { HttpWorkerPoolScope } from "../types/httpWorkerPoolScope.js";

/** A crash raises both `error` and `close`; the first cause is the one worth reporting. */
export function reportPoolFailure({
	scope,
	cause,
}: {
	scope: HttpWorkerPoolScope;
	cause: unknown;
}): void {
	const { state } = scope;
	if (state.failed || state.stopping) return;
	state.failed = true;
	scope.ctx.logger.error(
		{ error: cause },
		"HTTP worker pool failed; the task must be replaced",
	);
	scope.ctx.onFatal({ cause });
}
