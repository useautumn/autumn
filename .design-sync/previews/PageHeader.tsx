import { Button, PageHeader } from "@autumn/ui";
import { GearIcon, UsersIcon } from "@phosphor-icons/react";

export const Default = () => (
	<PageHeader
		icon={<GearIcon size={16} weight="fill" className="text-subtle" />}
		title="Settings"
	/>
);

export const WithActions = () => (
	<PageHeader
		icon={<UsersIcon size={16} weight="fill" className="text-subtle" />}
		title="Customers"
	>
		<Button variant="secondary" size="sm">
			Filter
		</Button>
		<Button size="sm">Create customer</Button>
	</PageHeader>
);
