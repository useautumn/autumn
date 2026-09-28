import type { EdgeConfigStore } from "@autumn/edge-config";
import type { AutumnLogger } from "@autumn/logging";
import type { SlotGateDescription } from "../types/slotGate.js";
import type { TaskIdentity } from "../types/taskIdentity.js";
import type { ActiveSlotEdgeConfig } from "./activeSlotEdgeConfig.js";
import { describeSlotGate } from "./describeSlotGate.js";

export type SlotGate = {
	describe(): SlotGateDescription;
	isActive(): boolean;
	/** Resolves once this fleet is the active slot, at once when it already is; rejects with the signal's reason. */
	awaitActive(params: { signal: AbortSignal }): Promise<void>;
	/** Called with the gate's answer each time the record changes it; returns the unsubscribe. */
	subscribe(listener: (gate: SlotGateDescription) => void): () => void;
};

type SlotGateContext = {
	identity: TaskIdentity;
	activeSlot: Pick<EdgeConfigStore<ActiveSlotEdgeConfig>, "get" | "subscribe">;
	logger?: Pick<AutumnLogger, "info">;
};

export function createSlotGate({ ctx }: { ctx: SlotGateContext }): SlotGate {
	function describe(): SlotGateDescription {
		return describeSlotGate({
			identity: ctx.identity,
			config: ctx.activeSlot.get(),
		});
	}

	function isActive(): boolean {
		return describe().active;
	}

	/** Only a change of answer reaches the listener: a record rewritten with the same ARN is not a flip. */
	function subscribe(
		listener: (gate: SlotGateDescription) => void,
	): () => void {
		let last = describe().active;
		function onChange(): void {
			const gate = describe();
			if (gate.active === last) return;
			last = gate.active;
			listener(gate);
		}
		return ctx.activeSlot.subscribe(onChange);
	}

	function awaitActive({ signal }: { signal: AbortSignal }): Promise<void> {
		const gate = describe();
		if (gate.active) return Promise.resolve();
		if (signal.aborted) return Promise.reject(signal.reason);
		ctx.logger?.info(
			`Holding: active slot is ${gate.expectedServiceArn}, this task is ${ctx.identity.serviceArn}`,
		);
		return new Promise<void>((resolve, reject) => {
			function settle(): void {
				unsubscribe();
				signal.removeEventListener("abort", abort);
			}
			function onChange(): void {
				if (!isActive()) return;
				settle();
				resolve();
			}
			function abort(): void {
				settle();
				reject(signal.reason);
			}
			const unsubscribe = ctx.activeSlot.subscribe(onChange);
			signal.addEventListener("abort", abort, { once: true });
		});
	}

	return { describe, isActive, awaitActive, subscribe };
}
