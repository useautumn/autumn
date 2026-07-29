export type ExpectStripeSubOptions = {
	status?: "active" | "trialing";
	shouldBeCanceling?: boolean;
	subId?: string;
	subCount?: number;
	rewards?: string[];
	debug?: boolean;
};
