import { Badge, InfoRow } from "@autumn/ui";
import {
	CalendarBlankIcon,
	CreditCardIcon,
	EnvelopeSimpleIcon,
	IdentificationBadgeIcon,
} from "@phosphor-icons/react";

export const Default = () => (
	<div className="flex flex-col gap-2">
		<InfoRow label="Name" value="Acme Corp" />
		<InfoRow label="Email" value="billing@acme.com" />
		<InfoRow label="Created" value="Mar 1, 2025" />
	</div>
);

export const WithIcons = () => (
	<div className="flex flex-col gap-2">
		<InfoRow
			icon={<IdentificationBadgeIcon size={14} weight="fill" />}
			label="Customer"
			value="Acme Corp"
		/>
		<InfoRow
			icon={<EnvelopeSimpleIcon size={14} weight="fill" />}
			label="Email"
			value="billing@acme.com"
		/>
		<InfoRow
			icon={<CreditCardIcon size={14} weight="fill" />}
			label="Payment"
			value="Visa •••• 4242"
		/>
		<InfoRow
			icon={<CalendarBlankIcon size={14} weight="fill" />}
			label="Renews"
			value="Apr 1, 2025"
		/>
	</div>
);

export const Mono = () => (
	<div className="flex flex-col gap-2">
		<InfoRow label="Customer ID" mono value="cus_2x8Kp4RvLm9Qz" />
		<InfoRow label="Stripe ID" mono value="cus_QxLm2RvKp8Td" />
		<InfoRow label="Subscription" mono value="sub_1QxLm2RvKp8TdA" />
	</div>
);

export const NodeValue = () => (
	<div className="flex flex-col gap-2">
		<InfoRow label="Plan" value="Growth" />
		<InfoRow
			label="Status"
			value={<Badge variant="green">Active</Badge>}
		/>
		<InfoRow
			label="Environment"
			value={<Badge variant="muted">Sandbox</Badge>}
		/>
	</div>
);
