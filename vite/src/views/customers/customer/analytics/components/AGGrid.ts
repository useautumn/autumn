import { themeQuartz } from "ag-grid-community";

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

export const autumnTheme = themeQuartz.withParams({
	accentColor: "var(--primary)",
	backgroundColor: "var(--interactive-secondary)",
	borderColor: "var(--border)",
	browserColorScheme: "light",
	fontFamily: {
		googleFont: "Inter",
	},
	fontSize: 11,
	textColor: "var(--t2)",
	foregroundColor: "#52525B",
	headerBackgroundColor: "var(--card)",
	headerFontSize: 11,
	headerTextColor: "#A1A1AA",
	iconSize: 13,
	spacing: "5.25px",
	// rowBorder: "var(--border)",
	wrapperBorderRadius: "0",
	// wrapperBorder: "0",
});

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

export const paginationOptions = [10, 100, 500, 1000];
