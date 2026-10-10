import { meteringIdentityToSubjectKey } from "@autumn/balance-engine";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";
import { mergeCacheSubjects } from "../utils/mergeCacheSubjects.js";

export type CachePushQueue = {
	enqueue(params: { subjects: CacheSubjectRef[] }): void;
	/** Resolves once the queue has room, so the log is never read far ahead of the pushes. */
	waitForRoom(): Promise<void>;
	/** Resolves once nothing is waiting or in flight. */
	drain(): Promise<void>;
	pendingCount(): number;
	activeCount(): number;
};

/**
 * Pushes subjects on a pool that runs apart from the slice that named them. A subject still waiting when it changes
 * again is pushed once, at its newest offset. Pushes may land out of order: the Atom keeps the newest by its own
 * read_at and log_offset guard, so order is not kept here.
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
	let active = 0;
	let roomWaiters: (() => void)[] = [];
	let drainWaiters: (() => void)[] = [];

	function takeOldest(): CacheSubjectRef | undefined {
		for (const [key, cacheSubject] of pending) {
			pending.delete(key);
			return cacheSubject;
		}
	}

	function pump(): void {
		while (active < concurrency) {
			const cacheSubject = takeOldest();
			if (!cacheSubject) return;
			active++;
			void push({ cacheSubject }).finally(onPushed);
		}
	}

	function onPushed(): void {
		active--;
		pump();
		if (active === 0) {
			const drained = drainWaiters;
			drainWaiters = [];
			for (const resolve of drained) resolve();
		}
		if (pending.size >= maxPending) return;
		const waiters = roomWaiters;
		roomWaiters = [];
		for (const resolve of waiters) resolve();
	}

	function enqueue({ subjects }: { subjects: CacheSubjectRef[] }): void {
		for (const subject of subjects) {
			const key = meteringIdentityToSubjectKey({ identity: subject.identity });
			pending.set(
				key,
				mergeCacheSubjects({ held: pending.get(key), next: subject }),
			);
		}
		pump();
	}

	function waitForRoom(): Promise<void> {
		if (pending.size < maxPending) return Promise.resolve();
		return new Promise((resolve) => roomWaiters.push(resolve));
	}

	// With nothing in flight nothing is pending either: pump starts a waiting subject whenever a push slot is free.
	function drain(): Promise<void> {
		if (active === 0) return Promise.resolve();
		return new Promise((resolve) => drainWaiters.push(resolve));
	}

	return {
		enqueue,
		waitForRoom,
		drain,
		pendingCount: () => pending.size,
		activeCount: () => active,
	};
}
