import { Label, Switch } from "@autumn/ui";

export const States = () => (
	<div className="flex flex-wrap items-center gap-3">
		<Switch defaultChecked />
		<Switch />
		<Switch disabled defaultChecked />
		<Switch disabled />
	</div>
);

export const WithLabels = () => (
	<div className="flex flex-col gap-3">
		<Label>
			<Switch defaultChecked />
			Sandbox mode
		</Label>
		<Label>
			<Switch />
			Auto-collect payment
		</Label>
		<Label>
			<Switch defaultChecked />
			Send usage webhooks
		</Label>
	</div>
);

export const SettingsRow = () => (
	<div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3">
		<div className="flex flex-col">
			<span className="text-sm font-medium">Allow overage billing</span>
			<span className="text-xs text-muted-foreground">
				Charge $0.002 per credit beyond the plan limit
			</span>
		</div>
		<Switch defaultChecked />
	</div>
);
