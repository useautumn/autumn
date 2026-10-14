import type { HttpWorkerPoolScope } from "../types/httpWorkerPoolScope.js";

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
