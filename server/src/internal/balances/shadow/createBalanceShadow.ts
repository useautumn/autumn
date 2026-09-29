import { meteringIdentityToPartitionKey } from "@autumn/balance-engine";
import type { TrackReply } from "@autumn/balance-worker-client";
import type {
	BalanceShadow,
	BalanceShadowDependencies,
	BalanceShadowTrack,
} from "./balanceShadowTypes.js";

/** What the shadow reports per track: the verdict, and the rows it drew from as they stand after it. */
function summarizeReply({ reply }: { reply: TrackReply }) {
	const { result, state } = reply;
	const drawnRowIds = new Set(result.deltas.map((delta) => delta.id));
	const remaining = [...state.customerEntitlements, ...state.rollovers]
		.filter((row) => drawnRowIds.has(row.id))
		.reduce((total, row) => total + row.balance, 0);
	return {
		revision: state.revision,
		status: result.status,
		remaining: drawnRowIds.size > 0 ? remaining : undefined,
		appliedValue: -result.deltas.reduce(
			(total, delta) => total + delta.valueDelta,
			0,
		),
	};
}

export function createBalanceShadow({
	dependencies,
	limits = { maxPending: 256, concurrency: 4, timeoutMs: 2_000 },
}: {
	dependencies: BalanceShadowDependencies;
	limits?: { maxPending: number; concurrency: number; timeoutMs: number };
}): BalanceShadow {
	if (
		Object.values(limits).some(
			(value) => !Number.isSafeInteger(value) || value <= 0,
		) ||
		limits.concurrency > limits.maxPending
	)
		throw new RangeError("Invalid shadow delivery limits");
	const queue: BalanceShadowTrack[] = [];
	const jobs = new Map<AbortController, Promise<void>>();
	const activeCustomers = new Set<string>();
	const counts = { submitted: 0, completed: 0, failed: 0, dropped: 0 };
	let scheduled: ReturnType<typeof setImmediate> | undefined;
	let stopped = false;
	let stopping: Promise<void> | undefined;

	function record(event: Record<string, unknown>): void {
		try {
			dependencies.report(event);
		} catch {
			// Shadow telemetry must not change the live response or stop delivery.
		}
	}
	function status() {
		return { ...counts, pending: queue.length, inFlight: jobs.size };
	}
	function drop({
		track,
		reason,
	}: {
		track: BalanceShadowTrack;
		reason: string;
	}): void {
		counts.dropped++;
		record({
			...track.command.identity,
			requestId: track.command.requestId,
			commandId: track.command.commandId,
			featureId: track.command.featureId,
			event: "dropped",
			reason,
		});
	}
	function schedule(): void {
		if (stopped || scheduled || queue.length === 0) return;
		scheduled = setImmediate(pump);
	}
	async function deliver({
		track,
		controller,
	}: {
		track: BalanceShadowTrack;
		controller: AbortController;
	}): Promise<void> {
		const startedAt = performance.now();
		const context = {
			...track.command.identity,
			requestId: track.command.requestId,
			commandId: track.command.commandId,
			featureId: track.command.featureId,
			value: track.command.value,
			source: track.source,
		};
		const timer = setTimeout(
			() => controller.abort(new Error("Shadow delivery timeout")),
			limits.timeoutMs,
		);
		try {
			controller.signal.throwIfAborted();
			const reply = await dependencies.client.track({
				command: track.command,
				signal: controller.signal,
			});
			const shadow = summarizeReply({ reply });
			counts.completed++;
			record({
				...context,
				event: "completed",
				durationMs: performance.now() - startedAt,
				shadow,
			});
		} catch (error) {
			counts.failed++;
			record({
				...context,
				event: "failed",
				durationMs: performance.now() - startedAt,
				reason: error instanceof Error ? error.message : "unknown_failure",
			});
		} finally {
			clearTimeout(timer);
		}
	}
	function pump(): void {
		scheduled = undefined;
		while (!stopped && jobs.size < limits.concurrency && queue.length > 0) {
			const index = queue.findIndex(
				({ command }) =>
					!activeCustomers.has(
						meteringIdentityToPartitionKey({ identity: command.identity }),
					),
			);
			if (index === -1) break;
			const [track] = queue.splice(index, 1);
			const customerKey = meteringIdentityToPartitionKey({
				identity: track.command.identity,
			});
			activeCustomers.add(customerKey);
			const controller = new AbortController();
			const job = Promise.resolve()
				.then(() => deliver({ track, controller }))
				.finally(() => {
					jobs.delete(controller);
					activeCustomers.delete(customerKey);
					schedule();
				});
			jobs.set(controller, job);
		}
	}
	function submit(track: BalanceShadowTrack): boolean {
		if (stopped || queue.length + jobs.size >= limits.maxPending) {
			drop({ track, reason: stopped ? "stopped" : "queue_full" });
			return false;
		}
		queue.push(structuredClone(track));
		counts.submitted++;
		record({
			...track.command.identity,
			requestId: track.command.requestId,
			commandId: track.command.commandId,
			featureId: track.command.featureId,
			event: "queued",
		});
		schedule();
		return true;
	}
	function stop(): Promise<void> {
		if (stopping) return stopping;
		stopped = true;
		if (scheduled) clearImmediate(scheduled);
		for (const track of queue.splice(0)) drop({ track, reason: "shutdown" });
		for (const controller of jobs.keys())
			controller.abort(
				new Error("Shadow stopped; in-flight result may be unknown"),
			);
		stopping = Promise.allSettled([...jobs.values()]).then(() => {
			record({ event: "stopped", ...status() });
		});
		return stopping;
	}
	return { submit, record, status, stop };
}
