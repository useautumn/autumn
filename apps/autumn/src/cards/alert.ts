import { Card, CardText as Text } from "chat";

type BaseAlertProps = {
	customerId: string;
	customerName?: string;
};

type PlanAlertProps = BaseAlertProps & {
	planName: string;
};

type PlanChangedProps = BaseAlertProps & {
	fromPlan: string;
	toPlan: string;
	direction: "upgrade" | "downgrade" | "change";
};

type CanceledProps = PlanAlertProps & {
	cancelsAt?: number;
};

type UsageAlertProps = BaseAlertProps & {
	featureId: string;
	thresholdType: string;
};

function displayName(props: BaseAlertProps): string {
	return props.customerName || props.customerId;
}

export function NewSubscriptionCard({ planName, ...props }: PlanAlertProps) {
	return Card({
		title: "🆕 New Subscription",
		children: [Text(`*${displayName(props)}* subscribed to *${planName}*.`)],
	});
}

export function PlanChangedCard({ fromPlan, toPlan, direction, ...props }: PlanChangedProps) {
	const emoji = direction === "upgrade" ? "⬆️" : direction === "downgrade" ? "⬇️" : "🔄";
	const label = direction.charAt(0).toUpperCase() + direction.slice(1);

	return Card({
		title: `${emoji} Plan ${label}`,
		children: [Text(`*${displayName(props)}* ${direction}d from *${fromPlan}* to *${toPlan}*.`)],
	});
}

export function SubscriptionCanceledCard({ planName, cancelsAt, ...props }: CanceledProps) {
	const endsText = cancelsAt
		? ` Access ends ${new Date(cancelsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
		: "";

	return Card({
		title: "❌ Subscription Canceled",
		children: [Text(`*${displayName(props)}* canceled *${planName}*.${endsText}`)],
	});
}

export function SubscriptionRenewedCard({ planName, ...props }: PlanAlertProps) {
	return Card({
		title: "🔁 Subscription Renewed",
		children: [Text(`*${displayName(props)}* renewed *${planName}*.`)],
	});
}

export function TrialConvertedCard({ planName, ...props }: PlanAlertProps) {
	return Card({
		title: "🎉 Trial Converted",
		children: [Text(`*${displayName(props)}* converted to *${planName}*.`)],
	});
}

export function ExpiredCard({ planName, ...props }: PlanAlertProps) {
	return Card({
		title: "⏰ Subscription Expired",
		children: [Text(`*${displayName(props)}*'s *${planName}* subscription has expired.`)],
	});
}

export function PastDueCard({ planName, ...props }: PlanAlertProps) {
	return Card({
		title: "⚠️ Payment Past Due",
		children: [Text(`*${displayName(props)}*'s payment for *${planName}* is past due.`)],
	});
}

export function UsageAlertCard({ featureId, thresholdType, ...props }: UsageAlertProps) {
	const label =
		thresholdType === "limit_reached" ? "hit the limit for" : "approaching the limit for";

	return Card({
		title: thresholdType === "limit_reached" ? "🚨 Limit Reached" : "📊 Usage Alert",
		children: [Text(`*${displayName(props)}* is ${label} *${featureId}*.`)],
	});
}
