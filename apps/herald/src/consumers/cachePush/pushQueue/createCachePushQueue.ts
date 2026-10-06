import { meteringIdentityToSubjectKey } from "@autumn/balance-engine";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";

export type CachePushQueue = {
	enqueue(params: { subjects: CacheSubjectRef[] }): void;
	/** Resolves once the queue has room, so the log is never read far ahead of the pushes. */
	waitForRoom(): Promise<void>;
	pendingCount(): number;
	activeCount(): number;
};

const isNewer = ({
	next,
	held,
}: {
	next: CacheSubjectRef;
	held: CacheSubjectRef | undefined;
}) => !held || next.logOffset > held.logOffset;

/**
 * Pushes subjects on a pool that runs apart from the slice that named them. A subject waiting twice is pushed once,
 * at its newest offset, and never while its own previous push is still in flight.
 */
export function createCachePushQueue({
	push,
	concurrency,
	maxPending,
}: {
	push: (params: { cacheSubject: CacheSubjectRef }) => Promise<void>;
	concurrency: number;
	maxPending: number;
}): CachePushQueue {
	const pending = new Map<string, CacheSubjectRef>();
	const inFlight = new Set<string>();
	let roomWaiters: (() => void)[] = [];

	function takeNext(): [string, CacheSubjectRef] | null {
		for (const entry of pending) {
			if (inFlight.has(entry[0])) continue;
			pending.delete(entry[0]);
			return entry;
		}
		return null;
	}

	function releaseRoomWaiters(): void {
		if (pending.size >= maxPending) return;
		const waiters = roomWaiters;
		roomWaiters = [];
		for (const resolve of waiters) resolve();
	}

	async function run([key, cacheSubject]: [string, CacheSubjectRef]) {
		try {
			await push({ cacheSubject });
		} finally {
			inFlight.delete(key);
			pump();
			releaseRoomWaiters();
		}
	}

	function pump(): void {
		while (inFlight.size < concurrency) {
			const next = takeNext();
			if (!next) return;
			inFlight.add(next[0]);
			void run(next);
		}
	}

	function enqueue({ subjects }: { subjects: CacheSubjectRef[] }): void {
		for (const subject of subjects) {
			const key = meteringIdentityToSubjectKey({ identity: subject.identity });
			if (!isNewer({ next: subject, held: pending.get(key) })) continue;
			pending.delete(key);
			pending.set(key, subject);
		}
		pump();
	}

	function waitForRoom(): Promise<void> {
		if (pending.size < maxPending) return Promise.resolve();
		return new Promise((resolve) => roomWaiters.push(resolve));
	}

	return {
		enqueue,
		waitForRoom,
		pendingCount: () => pending.size,
		activeCount: () => inFlight.size,
	};
}
