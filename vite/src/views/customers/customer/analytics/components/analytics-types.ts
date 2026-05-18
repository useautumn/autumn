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

export const colors = [
	"#9c5aff",
	"#a97eff",
	"#8268ff",
	"#7571ff",
	"#687aff",
	"#5b83ff",
	"#4e8cff",
	"#4195ff",
	"#349eff",
	"#27a7ff",
];
