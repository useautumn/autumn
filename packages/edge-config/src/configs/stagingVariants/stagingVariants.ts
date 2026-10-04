import type { StagingVariantsConfig } from "./stagingVariantsEdgeConfig.js";

const ARMS = ["A", "B", "C", "D"] as const;
const EXPERIMENT_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type StagingArm = (typeof ARMS)[number];

/** Only the staging admin bucket can turn variants on; prod and dev buckets always run A. */
export const STAGING_VARIANTS_BUCKET = "autumn-staging";

export function stagingVariantsEnabled({ bucket }: { bucket: string }) {
	return bucket === STAGING_VARIANTS_BUCKET;
}

/** Every service hashes the same wall-clock 10 s windows, so their logs line up per window. */
export const STAGING_VARIANT_WINDOW_MS = 10_000;

type Binding = {
	read: () => StagingVariantsConfig;
	identity: string;
	now: () => number;
};
type LiveArms = Readonly<Record<string, StagingArm>>;
type Snapshot = { windowIndex: number; arms: LiveArms | null };

let binding: Binding | null = null;
let snapshot: Snapshot | null = null;

export function stagingVariantsBound(): boolean {
	return binding !== null;
}

/**
 * FNV-1a with murmur3's finalizer: raw FNV's low bits are a parity of the input's low bits,
 * so `% 2` nearly alternates as the window index counts up and two experiments' arms coincide.
 */
function hashOf({ text }: { text: string }) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	hash ^= hash >>> 16;
	hash = Math.imul(hash, 0x85ebca6b);
	hash ^= hash >>> 13;
	hash = Math.imul(hash, 0xc2b2ae35);
	hash ^= hash >>> 16;
	return hash >>> 0;
}

/** A first, then one to three more distinct arms from A–D; anything else runs no experiment. */
export function activeArmsOf({
	arms,
}: {
	arms: readonly string[];
}): StagingArm[] {
	const valid =
		arms.length >= 2 &&
		arms.length <= ARMS.length &&
		arms[0] === "A" &&
		new Set(arms).size === arms.length &&
		arms.every((arm) => (ARMS as readonly string[]).includes(arm));
	return valid ? (arms as StagingArm[]) : [];
}

/** The window index a task-scoped experiment hashes with: the same for every window, so the arm never moves. */
export const TASK_SCOPE_WINDOW_INDEX = -1;

/** Hashed, not round-robin: a fixed A/B/A/B cycle aliases with periodic customer bursts. */
export function armForWindow({
	identity,
	windowIndex,
	experiment,
	arms,
}: {
	identity: string;
	windowIndex: number;
	experiment: string;
	arms: readonly StagingArm[];
}): StagingArm {
	return arms[
		hashOf({ text: `${identity}#${windowIndex}#${experiment}` }) % arms.length
	];
}

/** Call once at boot with the process's polled store; outside the staging bucket it stays unbound, so A. */
export function bindStagingVariants({
	read,
	identity,
	bucket,
	now = Date.now,
}: {
	read: () => StagingVariantsConfig;
	identity: string;
	bucket: string;
	now?: () => number;
}): boolean {
	snapshot = null;
	binding = stagingVariantsEnabled({ bucket }) ? { read, identity, now } : null;
	return binding !== null;
}

/** The config is read once per window, so a change lands at the next boundary and no window mixes arms. */
function currentArms(): LiveArms | null {
	if (!binding) return null;
	const windowIndex = Math.floor(binding.now() / STAGING_VARIANT_WINDOW_MS);
	if (snapshot?.windowIndex === windowIndex) return snapshot.arms;
	const arms: Record<string, StagingArm> = {};
	for (const [experiment, entry] of Object.entries(
		binding.read().experiments,
	)) {
		if (!EXPERIMENT_NAME.test(experiment)) continue;
		const active = activeArmsOf({ arms: entry.arms });
		if (!active.length) continue;
		arms[experiment] = armForWindow({
			identity: binding.identity,
			// A task-scoped experiment keeps one arm per task: the identity alone decides it.
			windowIndex:
				entry.scope === "task" ? TASK_SCOPE_WINDOW_INDEX : windowIndex,
			experiment,
			arms: active,
		});
	}
	const live = Object.keys(arms).length ? Object.freeze(arms) : null;
	snapshot = { windowIndex, arms: live };
	return live;
}

/** This window's arm of `experiment`; A whenever the experiment isn't live. Never throws. */
export function variant(experiment: string): StagingArm {
	try {
		return currentArms()?.[experiment] ?? "A";
	} catch {
		return "A";
	}
}

/** Every live experiment's arm for this window, for logs; null when none is live, so callers allocate nothing. */
export function variants(): LiveArms | null {
	try {
		return currentArms();
	} catch {
		return null;
	}
}
