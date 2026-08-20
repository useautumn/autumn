import { defineEvalConfig } from "eve/evals";

// Deterministic mechanics evals only — no LLM judge needed. Braintrust
// reporting can be added here once these run in CI.
export default defineEvalConfig({
	timeoutMs: 240_000,
});
