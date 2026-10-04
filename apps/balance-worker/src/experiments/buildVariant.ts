import { AB_EXPERIMENT } from "./abExperiment.js";

export type BuildVariant = "A" | "B";

let current: BuildVariant | null = null;

/** FNV-1a over the task's endpoint: stable for the task's life, about half the fleet each way. */
export function variantForEndpoint({
	endpoint,
}: {
	endpoint: string;
}): BuildVariant {
	let hash = 0x811c9dc5;
	for (let index = 0; index < endpoint.length; index++) {
		hash ^= endpoint.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0) % 2 === 0 ? "A" : "B";
}

/** Set once at boot; null whenever no experiment is enabled, so nothing reports a variant. */
export function initBuildVariant({
	endpoint,
	enabled = AB_EXPERIMENT.enabled,
}: {
	endpoint: string;
	enabled?: boolean;
}): BuildVariant | null {
	current = enabled ? variantForEndpoint({ endpoint }) : null;
	return current;
}

export function getBuildVariant(): BuildVariant | null {
	return current;
}

/** The experiment's guard: the changed code path runs only on variant B tasks. */
export function isVariantB(): boolean {
	return current === "B";
}
