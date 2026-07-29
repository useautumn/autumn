import { Button, StepBadge } from "@autumn/ui";

const SETUP_STEPS = [
	{
		title: "Create an app in your identity provider",
		description:
			"In Okta, Entra ID, Auth0 or Google Workspace, add an OIDC app, give it the callback URL we show you, then paste back the issuer and client credentials it issues.",
	},
	{
		title: "Verify your domain",
		description:
			"Add one TXT record to your DNS. This proves you control the domain before anyone at it is routed to your provider.",
	},
	{
		title: "Run a test sign-in",
		description:
			"Sign in once through your provider. When that works, SSO turns on for everyone with an email at your domain.",
	},
];

export const SsoEmptyState = ({ onStart }: { onStart: () => void }) => (
	<div className="flex flex-col items-start gap-6 rounded-lg border bg-card p-6">
		<div className="flex flex-col gap-1.5">
			<span className="text-sm font-medium text-foreground">
				Let your team sign in with company credentials
			</span>
			<p className="max-w-xl text-sm text-tertiary-foreground">
				Three steps, around ten minutes. You can stop after any step and pick
				setup back up later.
			</p>
		</div>

		<ol className="flex flex-col gap-5">
			{SETUP_STEPS.map((step, index) => (
				<li className="flex items-start gap-3" key={step.title}>
					<div className="shrink-0">
						<StepBadge>{index + 1}</StepBadge>
					</div>
					<div className="flex flex-col gap-1">
						<span className="text-sm font-medium text-foreground">
							{step.title}
						</span>
						<p className="max-w-xl text-sm text-tertiary-foreground">
							{step.description}
						</p>
					</div>
				</li>
			))}
		</ol>

		<Button variant="primary" onClick={onStart}>
			Start setup
		</Button>
	</div>
);
