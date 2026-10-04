import { AB_EXPERIMENT } from "./abExperiment.js";

const VARIANTS = ["A", "B", "C", "D"] as const;

export type BuildVariant = (typeof VARIANTS)[number];
export type VariantWindow = { variant: BuildVariant; arms: BuildVariant[] };

let endpoint = "";
let builtArms: readonly BuildVariant[] = ["A"];
let readConfiguredArms: () => readonly string[] = () => [];
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

/** Canonical A..D order whatever the config's order, so every task hashes onto the same list. */
export function activeArmsOf({
	configured,
	built,
}: {
	configured: readonly string[];
	built: readonly BuildVariant[];
}): BuildVariant[] {
	const treatments = VARIANTS.filter(
		(variant) =>
			variant !== "A" &&
			built.includes(variant) &&
			configured.includes(variant),
	);
	return treatments.length ? ["A", ...treatments] : [];
}

/** Hashed, not round-robin: a fixed A/B/A/B cycle aliases with periodic customer bursts. */
export function variantForWindow({
	endpoint,
	windowIndex,
	arms,
}: {
	endpoint: string;
	windowIndex: number;
	arms: readonly BuildVariant[];
}): BuildVariant {
	return arms[fnv1a({ text: `${endpoint}#${windowIndex}` }) % arms.length];
}

/** Set once at boot; the arms config is re-read as each window opens. */
export function initBuildVariant({
	endpoint: taskEndpoint,
	readConfiguredArms: read,
	builtArms: built = AB_EXPERIMENT.arms,
}: {
	endpoint: string;
	readConfiguredArms: () => readonly string[];
	builtArms?: readonly BuildVariant[];
}): void {
	endpoint = taskEndpoint;
	readConfiguredArms = read;
	builtArms = built;
	current = null;
}

/** Called as each 10 s event-loop report window opens; fewer than two live arms runs no experiment. */
export function startVariantWindow({
	windowIndex,
}: {
	windowIndex: number;
}): VariantWindow | null {
	const arms = activeArmsOf({
		configured: readConfiguredArms(),
		built: builtArms,
	});
	current = arms.length
		? variantForWindow({ endpoint, windowIndex, arms })
		: null;
	return current ? { variant: current, arms } : null;
}

export function getBuildVariant(): BuildVariant | null {
	return current;
}

/** The experiment's guard: an arm's changed code path runs only in that arm's windows. */
export function isVariant({ variant }: { variant: BuildVariant }): boolean {
	return current === variant;
}
