import type { AtomRecord } from "./atomRecord.js";

export type AtomStorage<T extends AtomRecord> = {
	find(): Promise<T | null>;
	update(params: { from: T; to: T }): Promise<void>;
	forget(params: { record: T }): Promise<void>;
};
