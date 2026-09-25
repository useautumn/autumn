export type ReviewChangeTone =
	| "new"
	| "ending"
	| "kept"
	| "changed"
	| "processor";

export type ReviewChangeIcon =
	| "plan"
	| "addOn"
	| "balance"
	| "subscription"
	| "schedule"
	| "item";

export type ReviewChangeRow = {
	key: string;
	icon: ReviewChangeIcon;
	title: string;
	detail?: string;
	code?: string;
	tone: ReviewChangeTone;
	label: string;
	value?: string;
	isEnding?: boolean;
};

export type ReviewChangeSection = {
	rows: ReviewChangeRow[];
	summary: string;
};
