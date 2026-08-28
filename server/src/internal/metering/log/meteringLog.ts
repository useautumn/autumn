import type { MeteringEvent } from "../events/meteringEventSchema.js";

export type MeteringLogRecord = {
	offset: number;
	event: MeteringEvent;
};

export interface MeteringLog {
	append(params: { event: MeteringEvent }): Promise<{ offset: number }>;
	getHighWatermark(): Promise<number>;
	read(params: {
		fromOffset: number;
		limit: number;
	}): Promise<MeteringLogRecord[]>;
}
