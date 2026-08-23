// Separates a scaffolded-but-unbuilt step (501) from a real fold failure (500),
// so shadow traffic never reads as a genuine error.
export class LedgerNotImplementedError extends Error {
	constructor(step: string) {
		super(`ledger: ${step} not implemented`);
		this.name = "LedgerNotImplementedError";
	}
}
