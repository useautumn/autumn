import { AB_EXPERIMENT } from "./abExperiment.js";

export type BuildVariant = "A" | "B";

let enabled = false;
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

/** Hashed, not alternating: strict A/B/A/B aliases with periodic customer bursts. */
export function variantForWindow({
	endpoint,
	windowIndex,
}: {
	endpoint: string;
	windowIndex: number;
}): BuildVariant {
	return fnv1a({ text: `${endpoint}#${windowIndex}` }) % 2 === 0 ? "A" : "B";
}

/** Set once at boot. Every task runs both variants, so each one is compared against its own workload. */
export function initBuildVariant({
	endpoint: taskEndpoint,
	enabled: on = AB_EXPERIMENT.enabled,
}: {
	endpoint: string;
	enabled?: boolean;
}): BuildVariant | null {
	enabled = on;
	endpoint = taskEndpoint;
	return startVariantWindow({ windowIndex: 0 });
}

/** Called as each 10 s event-loop report window opens; returns the variant it will run. */
export function startVariantWindow({
	windowIndex,
}: {
	windowIndex: number;
}): BuildVariant | null {
	current = enabled ? variantForWindow({ endpoint, windowIndex }) : null;
	return current;
}

export function getBuildVariant(): BuildVariant | null {
	return current;
}

/** The experiment's guard: the changed code path runs only in variant B windows. */
export function isVariantB(): boolean {
	return current === "B";
}
