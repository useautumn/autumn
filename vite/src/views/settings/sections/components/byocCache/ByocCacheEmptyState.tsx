import {
	type ByocCacheMachine,
	DEFAULT_BYOC_CACHE_MACHINE,
} from "@autumn/shared";
import { Button } from "@autumn/ui";
import { useState } from "react";
import { ByocCacheMachineTable } from "./ByocCacheMachineTable";
import { ByocCacheSetupStep } from "./ByocCacheSetupStep";
import { byocCacheMachineLabel } from "./byocCacheMachineDisplay";

const LATER_STEPS = [
	{
		title: "Deploy it into your AWS account",
		description:
			"One CloudFormation stack runs the cache on that machine. Nothing in your network opens to us.",
	},
	{
		title: "Autumn keeps it in sync",
		description:
			"Every balance change is pushed to the cache, so checks answer without a round trip to Autumn.",
	},
];

export const ByocCacheEmptyState = ({
	onDeploy,
	isDeploying,
}: {
	onDeploy: (machine: ByocCacheMachine) => void;
	isDeploying: boolean;
}) => {
	const [machine, setMachine] = useState<ByocCacheMachine>(
		DEFAULT_BYOC_CACHE_MACHINE,
	);

	return (
		<div className="flex flex-col items-start gap-6 rounded-lg border bg-card p-6">
			<div className="flex flex-col gap-1.5">
				<span className="text-sm font-medium text-foreground">
					Check balances from inside your own cloud
				</span>
				<p className="max-w-xl text-sm text-tertiary-foreground">
					One click to deploy, and you can resize or remove it at any time.
				</p>
			</div>

			<ol className="flex w-full flex-col gap-5">
				<ByocCacheSetupStep
					number={1}
					title="Pick a machine size"
					description="One Graviton instance in your AWS account. You can resize it later."
				>
					<ByocCacheMachineTable
						selected={machine}
						onSelect={setMachine}
						disabled={isDeploying}
					/>
				</ByocCacheSetupStep>
				{LATER_STEPS.map((step, index) => (
					<ByocCacheSetupStep key={step.title} number={index + 2} {...step} />
				))}
			</ol>

			<div className="flex items-center gap-3">
				<Button
					variant="primary"
					onClick={() => onDeploy(machine)}
					isLoading={isDeploying}
				>
					Deploy {byocCacheMachineLabel(machine)} cache
				</Button>
				<span className="text-xs text-subtle">
					Opens the AWS setup in a new tab
				</span>
			</div>
		</div>
	);
};
