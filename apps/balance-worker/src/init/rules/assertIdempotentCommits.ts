/** The worker commits idempotently only; a transactional config is refused at boot rather than served. */
export function assertIdempotentCommits({
	mode,
}: {
	mode: "transactional" | "idempotent";
}): void {
	if (mode === "idempotent") return;
	throw new Error(
		"The balance worker commits idempotently only; set BALANCE_WORKER_COMMIT_MODE=idempotent",
	);
}
