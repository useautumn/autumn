/**
 * A paired A/B experiment: one staging build carries both code paths and every task alternates
 * between them by 10 s window, so each variant sees the same workload. Experiment branches flip `enabled`.
 */
export const AB_EXPERIMENT: { enabled: boolean } = { enabled: false };
