import { z } from "zod/v4";

/**
 * Server-side mirror of the `migrations.prepared_state` JSONB column.
 * Keyed by per-module deterministic keys (e.g.
 * `ensure_prices_and_entitlements:update_plan`).
 *
 * Per-module output schemas live alongside each module
 * (`modules/<kind>/types.ts`). At the orchestrator layer we keep the
 * shape loose to avoid forcing every module's output type into the
 * orchestrator's import surface.
 */
export const PreparedStateSchema = z.record(z.string(), z.unknown());

export type PreparedState = z.infer<typeof PreparedStateSchema>;
