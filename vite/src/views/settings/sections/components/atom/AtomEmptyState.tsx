import {
	type ByocCacheMachine,
	DEFAULT_BYOC_CACHE_MACHINE,
} from "@autumn/shared";
import { Button } from "@autumn/ui";
import { useState } from "react";
import { AtomMachineTable } from "./AtomMachineTable";
import { AtomSetupStep } from "./AtomSetupStep";

const LATER_STEPS = [
	{
		title: "Deploy it into your AWS account",
		description:
			"One CloudFormation stack runs Atom on that machine. Nothing in your network opens to us.",
	},
	{
		title: "Autumn keeps it in sync",
		description:
			"Every balance change is pushed to Atom, so checks answer without a round trip to Autumn.",
	},
];

export const AtomEmptyState = ({
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
				<AtomSetupStep
					number={1}
					title="Pick a machine size"
					description="The AWS setup doesn't apply this yet: pick the same machine under Configure before you launch."
				>
					<AtomMachineTable
						selected={machine}
						onSelect={setMachine}
						disabled={isDeploying}
					/>
				</AtomSetupStep>
				{LATER_STEPS.map((step, index) => (
					<AtomSetupStep key={step.title} number={index + 2} {...step} />
				))}
			</ol>

			<div className="flex items-center gap-3">
				<Button
					variant="primary"
					onClick={() => onDeploy(machine)}
					isLoading={isDeploying}
				>
					Set up Atom
				</Button>
				<span className="text-xs text-subtle">
					Opens the AWS setup in a new tab
				</span>
			</div>
		</div>
	);
};
