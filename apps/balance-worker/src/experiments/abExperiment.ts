/**
 * A paired A/B experiment: one staging build carries both code paths and each task runs one,
 * so both variants share a run, its traffic and its chip mix. Experiment branches flip `enabled`.
 */
export const AB_EXPERIMENT: { enabled: boolean } = { enabled: false };
