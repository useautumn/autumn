import { IconButton } from "@autumn/ui";
import {
	ArrowSquareOutIcon,
	FunnelIcon,
	PlusIcon,
	TrashIcon,
} from "@phosphor-icons/react";

export const Variants = () => (
	<div className="flex flex-wrap items-center gap-2">
		<IconButton icon={<PlusIcon weight="bold" />} variant="primary">
			Create product
		</IconButton>
		<IconButton icon={<FunnelIcon weight="fill" />} variant="secondary">
			Filter
		</IconButton>
		<IconButton icon={<FunnelIcon weight="fill" />} variant="muted">
			Filter
		</IconButton>
		<IconButton icon={<TrashIcon weight="fill" />} variant="destructive">
			Delete
		</IconButton>
	</div>
);

export const IconOrientation = () => (
	<div className="flex flex-wrap items-center gap-2">
		<IconButton
			icon={<PlusIcon weight="bold" />}
			iconOrientation="left"
			variant="secondary"
		>
			Add feature
		</IconButton>
		<IconButton
			iconOrientation="right"
			rightIcon={<ArrowSquareOutIcon weight="bold" />}
			variant="secondary"
		>
			View in Stripe
		</IconButton>
	</div>
);

export const Sizes = () => (
	<div className="flex flex-wrap items-center gap-2">
		<IconButton
			icon={<FunnelIcon weight="fill" />}
			size="default"
			variant="secondary"
		>
			Filter
		</IconButton>
		<IconButton icon={<FunnelIcon weight="fill" />} size="sm" variant="secondary">
			Filter
		</IconButton>
	</div>
);

export const IconOnly = () => (
	<div className="flex flex-wrap items-center gap-2">
		<IconButton
			icon={<PlusIcon weight="bold" />}
			iconOrientation="center"
			variant="secondary"
		/>
		<IconButton
			icon={<TrashIcon weight="fill" />}
			iconOrientation="center"
			variant="skeleton"
		/>
		<IconButton
			icon={<ArrowSquareOutIcon weight="bold" />}
			iconOrientation="center"
			variant="muted"
		/>
	</div>
);
