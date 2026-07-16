import {
	Label,
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@autumn/ui";

export const Closed = () => (
	<div className="flex flex-col gap-3">
		<div className="flex flex-col gap-1.5">
			<Label>Billing interval</Label>
			<Select defaultValue="month">
				<SelectTrigger className="w-56">
					<SelectValue placeholder="Select an interval" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="month">Monthly</SelectItem>
					<SelectItem value="quarter">Quarterly</SelectItem>
					<SelectItem value="year">Annually</SelectItem>
				</SelectContent>
			</Select>
		</div>
		<div className="flex flex-col gap-1.5">
			<Label>Plan</Label>
			<Select>
				<SelectTrigger className="w-56">
					<SelectValue placeholder="Select a plan" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="free">Free</SelectItem>
					<SelectItem value="pro">Pro</SelectItem>
				</SelectContent>
			</Select>
		</div>
	</div>
);

export const Open = () => (
	<Select defaultValue="pro" open modal={false}>
		<SelectTrigger className="w-56">
			<SelectValue placeholder="Select a plan" />
		</SelectTrigger>
		<SelectContent>
			<SelectItem value="free">Free</SelectItem>
			<SelectItem value="pro">Pro — $49/month</SelectItem>
			<SelectItem value="scale">Scale — $199/month</SelectItem>
			<SelectItem value="enterprise">Enterprise</SelectItem>
		</SelectContent>
	</Select>
);

export const Grouped = () => (
	<Select defaultValue="credits" open modal={false}>
		<SelectTrigger className="w-56">
			<SelectValue placeholder="Select a feature" />
		</SelectTrigger>
		<SelectContent>
			<SelectGroup>
				<SelectLabel>Metered</SelectLabel>
				<SelectItem value="credits">API Credits</SelectItem>
				<SelectItem value="messages">Messages</SelectItem>
			</SelectGroup>
			<SelectSeparator />
			<SelectGroup>
				<SelectLabel>Boolean</SelectLabel>
				<SelectItem value="sso">SSO</SelectItem>
				<SelectItem value="support">Priority support</SelectItem>
			</SelectGroup>
		</SelectContent>
	</Select>
);

export const Sizes = () => (
	<div className="flex flex-col gap-2">
		<Select defaultValue="usd">
			<SelectTrigger size="sm" className="w-40">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="usd">USD</SelectItem>
				<SelectItem value="eur">EUR</SelectItem>
			</SelectContent>
		</Select>
		<Select defaultValue="usd" disabled>
			<SelectTrigger className="w-40">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="usd">USD</SelectItem>
			</SelectContent>
		</Select>
	</div>
);
