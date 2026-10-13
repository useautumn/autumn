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

type Waiting = { cacheSubject: CacheSubjectRef; queuedAt: number };

/**
 * Pushes subjects on a pool that runs apart from the slice that named them. A subject waits `lingerMs` from its first
 * change, so the changes a hot customer makes meanwhile are pushed once, at its newest offset. Pushes may land out of
 * order: the Atom keeps the newest by its own read_at and log_offset guard, so order is not kept here.
 */
export function createCachePushQueue({
	push,
	concurrency,
	maxPending,
	lingerMs = 0,
}: {
	push: (params: { cacheSubject: CacheSubjectRef }) => Promise<void>;
	concurrency: number;
	maxPending: number;
	lingerMs?: number;
}): CachePushQueue {
	const pending = new Map<string, Waiting>();
	let active = 0;
	let draining = false;
	let isLingerScheduled = false;
	let roomWaiters: (() => void)[] = [];
	let drainWaiters: (() => void)[] = [];

	/** The oldest subject once it has lingered; a map keeps first-insertion order, so a change never moves its subject back. */
	function takeLingered(): CacheSubjectRef | undefined {
		for (const [key, waiting] of pending) {
			const waitLeft = waiting.queuedAt + lingerMs - performance.now();
			if (waitLeft > 0 && !draining) {
				if (isLingerScheduled) return undefined;
				isLingerScheduled = true;
				setTimeout(() => {
					isLingerScheduled = false;
					pump();
				}, waitLeft);
				return undefined;
			}
			pending.delete(key);
			return waiting.cacheSubject;
		}
	}

	function pump(): void {
		while (active < concurrency) {
			const cacheSubject = takeLingered();
			if (!cacheSubject) return;
			active++;
			void push({ cacheSubject }).finally(onPushed);
		}
	}

	function onPushed(): void {
		active--;
		pump();
		if (active === 0 && pending.size === 0) {
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
			const held = pending.get(key);
			pending.set(key, {
				cacheSubject: mergeCacheSubjects({
					held: held?.cacheSubject,
					next: subject,
				}),
				queuedAt: held?.queuedAt ?? performance.now(),
			});
		}
		pump();
	}

	function waitForRoom(): Promise<void> {
		if (pending.size < maxPending) return Promise.resolve();
		return new Promise((resolve) => roomWaiters.push(resolve));
	}

	/** Pushes what is still lingering at once: the slices that named it are already committed. */
	function drain(): Promise<void> {
		draining = true;
		pump();
		if (active === 0 && pending.size === 0) return Promise.resolve();
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
