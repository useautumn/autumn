export type EventRow = Record<string, string | number>;

export interface EventsData {
	meta: Array<{ name: string }>;
	rows: number;
	data: EventRow[];
}

export type Row =
	| {
			interval_start: string;
	  }
	| {
			[key: string]: number;
	  };

export interface IRow {
	timestamp: string;
	event_name: string;
	value: number;
	properties: any;
	idempotency_key: string;
	entity_id: string;
	customer_id: string;
}
