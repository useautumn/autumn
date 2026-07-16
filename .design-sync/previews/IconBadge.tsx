import { IconBadge } from "@autumn/ui";
import {
	ArrowUpRightIcon,
	CreditCardIcon,
	LightningIcon,
	RepeatIcon,
	UsersIcon,
} from "@phosphor-icons/react";

export const Default = () => (
	<div className="flex flex-wrap items-center gap-2">
		<IconBadge icon={<UsersIcon weight="fill" />}>24 seats</IconBadge>
		<IconBadge icon={<LightningIcon weight="fill" />}>128k calls</IconBadge>
		<IconBadge icon={<RepeatIcon weight="bold" />}>Monthly</IconBadge>
	</div>
);

export const Variants = () => (
	<div className="flex flex-wrap items-center gap-2">
		<IconBadge icon={<CreditCardIcon weight="fill" />} variant="muted">
			Visa 4242
		</IconBadge>
		<IconBadge icon={<CreditCardIcon weight="fill" />} variant="default">
			Visa 4242
		</IconBadge>
	</div>
);

export const IconPosition = () => (
	<div className="flex flex-wrap items-center gap-2">
		<IconBadge icon={<LightningIcon weight="fill" />} position="left">
			Usage-based
		</IconBadge>
		<IconBadge icon={<ArrowUpRightIcon weight="bold" />} position="right">
			View in Stripe
		</IconBadge>
	</div>
);

export const BothIcons = () => (
	<div className="flex flex-wrap items-center gap-2">
		<IconBadge
			icon={<RepeatIcon weight="bold" />}
			rightIcon={<ArrowUpRightIcon weight="bold" />}
		>
			Renews Apr 1
		</IconBadge>
	</div>
);
