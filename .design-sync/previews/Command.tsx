import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
	CommandShortcut,
} from "@autumn/ui";
import {
	CreditCardIcon,
	CubeIcon,
	GearIcon,
	MagnifyingGlassIcon,
	UsersIcon,
} from "@phosphor-icons/react";

export const Default = () => (
	<Command className="rounded-lg ring-1 ring-foreground/10">
		<CommandInput placeholder="Search customers, plans, invoices..." />
		<CommandList>
			<CommandGroup heading="Navigate">
				<CommandItem>
					<UsersIcon size={16} weight="fill" />
					Customers
					<CommandShortcut>⌘1</CommandShortcut>
				</CommandItem>
				<CommandItem>
					<CubeIcon size={16} weight="fill" />
					Products
					<CommandShortcut>⌘2</CommandShortcut>
				</CommandItem>
				<CommandItem>
					<CreditCardIcon size={16} weight="fill" />
					Invoices
					<CommandShortcut>⌘3</CommandShortcut>
				</CommandItem>
			</CommandGroup>
			<CommandSeparator />
			<CommandGroup heading="Actions">
				<CommandItem>
					<GearIcon size={16} weight="fill" />
					Open settings
				</CommandItem>
				<CommandItem>
					<MagnifyingGlassIcon size={16} weight="fill" />
					Search Stripe events
				</CommandItem>
			</CommandGroup>
		</CommandList>
	</Command>
);

export const SearchResults = () => (
	<Command className="rounded-lg ring-1 ring-foreground/10">
		<CommandInput placeholder="Search customers..." value="acme" />
		<CommandList>
			<CommandGroup heading="Customers">
				<CommandItem value="acme-corp">
					Acme Corp
					<span className="text-muted-foreground ml-auto text-xs">
						billing@acme.com
					</span>
				</CommandItem>
				<CommandItem value="acme-labs">
					Acme Labs
					<span className="text-muted-foreground ml-auto text-xs">
						cus_3f8Kd92Lm4
					</span>
				</CommandItem>
			</CommandGroup>
			<CommandSeparator />
			<CommandGroup heading="Plans">
				<CommandItem value="acme-enterprise">Acme Enterprise (custom)</CommandItem>
			</CommandGroup>
		</CommandList>
	</Command>
);

export const Empty = () => (
	<Command className="rounded-lg ring-1 ring-foreground/10" shouldFilter={false}>
		<CommandInput placeholder="Search customers..." value="zzzz" />
		<CommandList>
			<CommandEmpty>No customers found.</CommandEmpty>
		</CommandList>
	</Command>
);
