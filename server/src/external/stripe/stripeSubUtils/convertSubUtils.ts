import type Stripe from "stripe";

export const getLatestPeriodEnd = ({
	sub,
	subItems,
}: {
	sub?: Stripe.Subscription;
	subItems?: Stripe.SubscriptionItem[];
}) => {
	if (!subItems) {
		subItems = sub?.items.data || [];
	}
	if (subItems.length === 0) {
		return Date.now();
	}

	return subItems.reduce((acc, item) => {
		return Math.max(acc, item.current_period_end);
	}, subItems[0].current_period_end);
};

export const getEarliestPeriodEnd = ({ sub }: { sub: Stripe.Subscription }) => {
	if (sub.items.data.length === 0) {
		return Date.now();
	}

	return sub.items.data.reduce((acc, item) => {
		return Math.min(acc, item.current_period_end);
	}, sub.items.data[0].current_period_end);
};

export const getEarliestPeriodStart = ({
	sub,
}: {
	sub: Stripe.Subscription;
}) => {
	if (sub.items.data.length === 0) {
		return Date.now();
	}

	return sub.items.data.reduce((acc, item) => {
		return Math.min(acc, item.current_period_start);
	}, sub.items.data[0].current_period_start);
};
export const getLatestPeriodStart = ({ sub }: { sub: Stripe.Subscription }) => {
	if (sub.items.data.length === 0) {
		return Date.now();
	}

	return sub.items.data.reduce((acc, item) => {
		return Math.max(acc, item.current_period_start);
	}, sub.items.data[0].current_period_start);
};

export const subToPeriodStartEnd = ({ sub }: { sub?: Stripe.Subscription }) => {
	if (!sub || sub.items.data.length === 0) {
		return {
			start: Date.now(),
			end: Date.now(),
		};
	}

	return {
		// start: getEarliestPeriodStart({ sub }),
		start: getLatestPeriodStart({ sub }),
		end: getEarliestPeriodEnd({ sub }),
	};
};
