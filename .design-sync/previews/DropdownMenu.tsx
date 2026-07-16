import {
	Button,
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@autumn/ui";
import { ArrowsClockwiseIcon, TrashIcon, UserIcon } from "@phosphor-icons/react";

export const Default = () => (
	<DropdownMenu open modal={false}>
		<DropdownMenuTrigger render={<Button variant="secondary" size="sm" />}>
			Acme Corp
		</DropdownMenuTrigger>
		<DropdownMenuContent side="bottom" align="start" className="w-56">
			<DropdownMenuGroup>
				<DropdownMenuLabel>Customer actions</DropdownMenuLabel>
				<DropdownMenuItem>
					<UserIcon size={16} weight="fill" />
					View customer
					<DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
				</DropdownMenuItem>
				<DropdownMenuItem>
					<ArrowsClockwiseIcon size={16} weight="fill" />
					Sync with Stripe
				</DropdownMenuItem>
			</DropdownMenuGroup>
			<DropdownMenuSeparator />
			<DropdownMenuItem variant="destructive">
				<TrashIcon size={16} weight="fill" />
				Delete customer
				<DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
);

export const WithCheckboxItems = () => (
	<DropdownMenu open modal={false}>
		<DropdownMenuTrigger render={<Button variant="secondary" size="sm" />}>
			Columns
		</DropdownMenuTrigger>
		<DropdownMenuContent side="bottom" align="start" className="w-52">
			<DropdownMenuGroup>
				<DropdownMenuLabel>Visible columns</DropdownMenuLabel>
				<DropdownMenuCheckboxItem checked>Customer</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem checked>Plan</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem checked>Created at</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem>Stripe ID</DropdownMenuCheckboxItem>
				<DropdownMenuCheckboxItem>Balance</DropdownMenuCheckboxItem>
			</DropdownMenuGroup>
		</DropdownMenuContent>
	</DropdownMenu>
);

export const States = () => (
	<DropdownMenu open modal={false}>
		<DropdownMenuTrigger render={<Button variant="secondary" size="sm" />}>
			Invoice
		</DropdownMenuTrigger>
		<DropdownMenuContent side="bottom" align="start" className="w-52">
			<DropdownMenuItem>Download PDF</DropdownMenuItem>
			<DropdownMenuItem isLoading>Refunding</DropdownMenuItem>
			<DropdownMenuItem disabled>Void invoice</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem>View in Stripe</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
);
