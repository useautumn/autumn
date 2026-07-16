import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
} from "@autumn/ui";

export const Default = () => (
	<Dialog open modal={false}>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Create customer</DialogTitle>
				<DialogDescription>
					Customers are billed against the plans you attach to them.
				</DialogDescription>
			</DialogHeader>
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-1.5">
					<Label>Customer ID</Label>
					<Input defaultValue="acme-corp" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>Email</Label>
					<Input defaultValue="billing@acme.com" />
				</div>
			</div>
			<DialogFooter>
				<Button variant="secondary" size="sm">
					Cancel
				</Button>
				<Button size="sm">Create customer</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);

export const Destructive = () => (
	<Dialog open modal={false}>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Cancel subscription?</DialogTitle>
				<DialogDescription>
					Acme Corp will keep access to Pro until the current period ends on Aug
					1, 2026. No further invoices will be created.
				</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<Button variant="secondary" size="sm">
					Keep subscription
				</Button>
				<Button variant="destructive" size="sm">
					Cancel subscription
				</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);

export const WithoutCloseButton = () => (
	<Dialog open modal={false}>
		<DialogContent showCloseButton={false}>
			<DialogHeader>
				<DialogTitle>Connect Stripe</DialogTitle>
				<DialogDescription>
					Autumn syncs products, prices and invoices to your Stripe account.
				</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<Button size="sm">Connect Stripe</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>
);
