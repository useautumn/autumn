export function assertIdempotentCommits({
	mode,
}: {
	mode: "transactional" | "idempotent";
}): void {
	if (mode === "idempotent") return;
	throw new Error(
		"The balance worker's producer thread speaks idempotent commits only; set BALANCE_WORKER_COMMIT_MODE=idempotent",
	);
}
