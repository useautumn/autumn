export type StateBackend = "sqlite" | "postgres";

/** Which backend the worker builds unless its config says otherwise. Flipping this is the whole revert. */
export const STATE_BACKEND: StateBackend = "sqlite";
