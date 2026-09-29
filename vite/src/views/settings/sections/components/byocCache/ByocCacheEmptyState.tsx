import { Button, StepBadge } from "@autumn/ui";

const SETUP_STEPS = [
	{
		title: "Deploy the cache into your AWS account",
		description:
			"One CloudFormation stack creates a DynamoDB table in your account. Nothing in your network opens to us.",
	},
	{
		title: "Autumn keeps it in sync",
		description:
			"Every balance change is written to the table, so your app answers checks without a round trip to Autumn.",
	},
];

export const ByocCacheEmptyState = ({
	onDeploy,
	isDeploying,
}: {
	onDeploy: () => void;
	isDeploying: boolean;
}) => (
	<div className="flex flex-col items-start gap-6 rounded-lg border bg-card p-6">
		<div className="flex flex-col gap-1.5">
			<span className="text-sm font-medium text-foreground">
				Check balances from inside your own cloud
			</span>
			<p className="max-w-xl text-sm text-tertiary-foreground">
				One click to deploy, and you can remove it at any time.
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

		<Button variant="primary" onClick={onDeploy} isLoading={isDeploying}>
			Deploy cache
		</Button>
	</div>
);
