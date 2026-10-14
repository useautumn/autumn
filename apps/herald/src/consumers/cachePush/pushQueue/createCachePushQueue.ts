import { meteringIdentityToSubjectKey } from "@autumn/balance-engine";
import type { CacheSubjectRef } from "../types/cacheSubjectRef.js";
import { mergeCacheSubjects } from "../utils/mergeCacheSubjects.js";

export type CachePushQueue = {
	enqueue(params: { subjects: CacheSubjectRef[] }): void;
	waitForRoom(): Promise<void>;
	drain(): Promise<void>;
	pendingCount(): number;
	activeCount(): number;
};

type Waiting = { cacheSubject: CacheSubjectRef; queuedAt: number };

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
