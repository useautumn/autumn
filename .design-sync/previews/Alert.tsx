import { Alert, AlertAction, AlertDescription, AlertTitle, Button } from "@autumn/ui";
import { InfoIcon, WarningIcon } from "@phosphor-icons/react";

export const Default = () => (
	<Alert>
		<InfoIcon size={16} weight="fill" />
		<AlertTitle>Sandbox mode</AlertTitle>
		<AlertDescription>
			Customers created here won't be charged. Switch to production when you're
			ready to go live.
		</AlertDescription>
	</Alert>
);

export const Destructive = () => (
	<Alert variant="destructive">
		<WarningIcon size={16} weight="fill" />
		<AlertTitle>Payment method declined</AlertTitle>
		<AlertDescription>
			The card ending in 4242 was declined. Update the payment method to resume
			this subscription.
		</AlertDescription>
	</Alert>
);

export const WithAction = () => (
	<Alert>
		<InfoIcon size={16} weight="fill" />
		<AlertTitle>Stripe not connected</AlertTitle>
		<AlertDescription>
			Connect your Stripe account to start billing customers.
		</AlertDescription>
		<AlertAction>
			<Button size="sm" variant="secondary">
				Connect
			</Button>
		</AlertAction>
	</Alert>
);

export const TitleOnly = () => (
	<Alert>
		<AlertTitle>Your changes have been saved.</AlertTitle>
	</Alert>
);
