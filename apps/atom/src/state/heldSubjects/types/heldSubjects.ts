import type { HeldSubject } from "../../types/heldSubject.js";

export type HeldSubjects = {
	get(key: string): HeldSubject | undefined;
	hold(params: { key: string } & HeldSubject): void;
	drop(key: string): boolean;
	dropPrefix(prefix: string): void;
	expireIdle(): void;
	readonly size: number;
	readonly bytes: number;
	readonly lookups: number;
	readonly misses: number;
	readonly evicted: number;
	readonly expired: number;
};
