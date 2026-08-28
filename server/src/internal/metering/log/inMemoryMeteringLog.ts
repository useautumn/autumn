import type { MeteringEvent } from "../events/meteringEventSchema.js";
import type { MeteringLog, MeteringLogRecord } from "./meteringLog.js";

export class InMemoryMeteringLog implements MeteringLog {
	readonly partition: number;
	private readonly records: MeteringLogRecord[] = [];

	constructor({ partition = 0 }: { partition?: number } = {}) {
		this.partition = partition;
	}

	get nextOffset(): number {
		return this.records.length;
	}

	async append({ event }: { event: MeteringEvent }): Promise<{
		offset: number;
	}> {
		const offset = this.records.length;
		this.records.push({ offset, event });
		return { offset };
	}

	async getHighWatermark(): Promise<number> {
		return this.records.length;
	}

	async read({
		fromOffset,
		limit,
	}: {
		fromOffset: number;
		limit: number;
	}): Promise<MeteringLogRecord[]> {
		if (fromOffset < 0 || limit <= 0) return [];
		return this.records.slice(fromOffset, fromOffset + limit);
	}
}
