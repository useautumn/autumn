export type ReviewChangeTone = "new" | "ending" | "kept" | "changed";

export type ReviewChangeValue = {
	amount: string;
	suffix?: string;
};

export type ReviewChangeQuantity = {
	current: number;
	previous?: number;
};

export type ReviewChangeRow = {
	key: string;
	title: string;
	description?: string;
	flag?: string;
	tone?: ReviewChangeTone;
	value?: ReviewChangeValue;
	quantity?: ReviewChangeQuantity;
};

export type ReviewChangePhase = {
	key: string;
	label: string;
	total?: string;
	rows: ReviewChangeRow[];
};

export type ReviewStripeId = {
	key: string;
	label: string;
	id: string;
};

export type ReviewChangeSection = {
	phases: ReviewChangePhase[];
	summary: string;
	stripeIds: ReviewStripeId[];
};
