import type { SlotGate } from "@autumn/blue-green";
import type { AutumnLogger } from "@autumn/logging";

export type SlotState = "idle" | "active";

export type SlotJobs = {
	start(): Promise<void>;
	stop(): Promise<void>;
};

export type SlotFollower = {
	start(): Promise<void>;
	stop(): Promise<void>;
	readState(): SlotState;
};

type FollowSlotContext = {
	gate: Pick<SlotGate, "describe" | "subscribe">;
	jobs: SlotJobs;
	logger: Pick<AutumnLogger, "info" | "error">;
};

export function createSlotFollower({
	ctx,
}: {
	ctx: FollowSlotContext;
}): SlotFollower {
	let state: SlotState = "idle";
	let wanted: SlotState = "idle";
	let flipped = false;
	let transitioning: Promise<void> | null = null;
	let unsubscribe: (() => void) | null = null;
	let following = false;

	function wantedOf(): SlotState {
		return ctx.gate.describe().active ? "active" : "idle";
	}

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
