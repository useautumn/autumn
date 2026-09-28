import type { SlotGate } from "@autumn/blue-green";
import type { AutumnLogger } from "@autumn/logging";

export type SlotState = "idle" | "active";

/** The jobs as the slot sees them: built when the slot turns active, stopped and dropped when it turns idle. */
export type SlotJobs = {
	start(): Promise<void>;
	stop(): Promise<void>;
};

export type SlotFollower = {
	/** Reads the gate once, acts on it, then follows every change of its answer. */
	start(): Promise<void>;
	/** Stops following and, if active, stops the jobs; the slot's last state is left behind. */
	stop(): Promise<void>;
	readState(): SlotState;
};

type FollowSlotContext = {
	gate: Pick<SlotGate, "describe" | "subscribe">;
	jobs: SlotJobs;
	logger: Pick<AutumnLogger, "info" | "error">;
};

/**
 * Active means the jobs are in their consumer groups; idle means they are out. Transitions run one at a
 * time: a flip that arrives during a transition is remembered as the wanted state and applied after, so two
 * flips in a row cost one start or one stop, never an overlap.
 */
export function createSlotFollower({
	ctx,
}: {
	ctx: FollowSlotContext;
}): SlotFollower {
	let state: SlotState = "idle";
	let wanted: SlotState = "idle";
	/** A flip happened since the last look; cleared by the loop, so a flip during a transition is never lost. */
	let flipped = false;
	let transitioning: Promise<void> | null = null;
	let unsubscribe: (() => void) | null = null;
	let following = false;

	function wantedOf(): SlotState {
		return ctx.gate.describe().active ? "active" : "idle";
	}

	/** Runs until the slot is where the last flip wants it; a failed transition gives up until the next flip. */
	async function reconcile(): Promise<void> {
		while (flipped) {
			flipped = false;
			if (state === wanted) continue;
			const next = wanted;
			try {
				if (next === "active") await ctx.jobs.start();
				else await ctx.jobs.stop();
				state = next;
				ctx.logger.info(
					{ type: "herald_slot_changed", data: { state } },
					state === "active"
						? "Herald is the active slot; jobs joined their groups"
						: "Herald is the idle slot; jobs left their groups",
				);
			} catch (cause) {
				// A start that failed left nothing running: the state is idle and the next flip tries again.
				state = "idle";
				ctx.logger.error(
					{
						error: cause,
						type: "herald_slot_transition_failed",
						data: { wanted: next },
					},
					"Herald could not follow its slot",
				);
				return;
			}
		}
	}

	function settle(): Promise<void> {
		if (!transitioning)
			transitioning = reconcile().finally(() => {
				transitioning = null;
				// A flip that landed as the loop was leaving starts the next run.
				if (flipped) void settle();
			});
		return transitioning;
	}

	function want(next: SlotState): Promise<void> {
		wanted = next;
		flipped = true;
		return settle();
	}

	function onGateChanged(): void {
		if (!following) return;
		void want(wantedOf());
	}

	async function start(): Promise<void> {
		if (following) return;
		following = true;
		unsubscribe = ctx.gate.subscribe(onGateChanged);
		await want(wantedOf());
	}

	async function stop(): Promise<void> {
		following = false;
		unsubscribe?.();
		unsubscribe = null;
		await want("idle");
	}

	function readState(): SlotState {
		return state;
	}

	return { start, stop, readState };
}
