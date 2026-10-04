import { AB_EXPERIMENT } from "./abExperiment.js";

const VARIANTS = ["A", "B", "C", "D"] as const;

export type BuildVariant = (typeof VARIANTS)[number];
export type ArmCount = (typeof AB_EXPERIMENT)["arms"];

let enabled = false;
let arms: ArmCount = 2;
let endpoint = "";
let current: BuildVariant | null = null;

/** FNV-1a: deterministic, so a window's variant can be recomputed from its task and index. */
function fnv1a({ text }: { text: string }) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** Hashed, not round-robin: a fixed A/B/A/B cycle aliases with periodic customer bursts. */
export function variantForWindow({
	endpoint,
	windowIndex,
	arms,
}: {
	endpoint: string;
	windowIndex: number;
	arms: ArmCount;
}): BuildVariant {
	return VARIANTS[fnv1a({ text: `${endpoint}#${windowIndex}` }) % arms];
}

/** Set once at boot. Every task runs every arm, so each one is compared against its own workload. */
export function initBuildVariant({
	endpoint: taskEndpoint,
	enabled: on = AB_EXPERIMENT.enabled,
	arms: armCount = AB_EXPERIMENT.arms,
}: {
	endpoint: string;
	enabled?: boolean;
	arms?: ArmCount;
}): BuildVariant | null {
	enabled = on;
	arms = armCount;
	endpoint = taskEndpoint;
	return startVariantWindow({ windowIndex: 0 });
}

/** Called as each 10 s event-loop report window opens; returns the variant it will run. */
export function startVariantWindow({
	windowIndex,
}: {
	windowIndex: number;
}): BuildVariant | null {
	current = enabled ? variantForWindow({ endpoint, windowIndex, arms }) : null;
	return current;
}

export function getBuildVariant(): BuildVariant | null {
	return current;
}

/** The experiment's guard: an arm's changed code path runs only in that arm's windows. */
export function isVariant({ variant }: { variant: BuildVariant }): boolean {
	return current === variant;
}
