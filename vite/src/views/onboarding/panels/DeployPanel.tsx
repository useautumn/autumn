import { Button, MiniCopyButton } from "@autumn/ui";
import { ArrowRightIcon, CheckCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import {
	useConnectStripe,
	useCopyPlansToProd,
	useCreateProdApiKey,
	useGoToProduction,
} from "@/views/main-sidebar/deploy-dialog/useDeployActions";

function DeployRow({
	index,
	title,
	description,
	action,
}: {
	index: number;
	title: string;
	description: string;
	action: ReactNode;
}) {
	return (
		<div className="flex items-center gap-3 px-3 py-2.5">
			<span className="flex size-4 shrink-0 items-center justify-center rounded-full border text-tiny text-subtle">
				{index}
			</span>
			<div className="flex min-w-0 flex-col">
				<span className="truncate text-xs font-medium text-foreground">
					{title}
				</span>
				<span className="truncate text-tiny text-subtle">{description}</span>
			</div>
			<div className="ml-auto shrink-0">{action}</div>
		</div>
	);
}

/** One width for every action, so the right edge is a single line. */
const ACTION_WIDTH = "w-[136px]";

function DoneLabel({ children }: { children: ReactNode }) {
	return (
		<span className="flex items-center gap-1.5 text-tiny text-tertiary-foreground">
			<CheckCircleIcon size={13} weight="fill" className="text-green-500" />
			{children}
		</span>
	);
}

/** The production checklist in the page's row grammar, plus the final switch —
 * the same actions the deploy dialog runs, via shared hooks. */
export function DeployPanel() {
	const stripe = useConnectStripe({ isActive: true });
	const plans = useCopyPlansToProd();
	const apiKey = useCreateProdApiKey();
	const production = useGoToProduction();

	return (
		<div className="flex flex-col gap-3">
			<div className="divide-y rounded-lg border bg-interactive-secondary">
				<DeployRow
					index={1}
					title="Connect your Stripe account"
					description="Connect your live Stripe account to accept real payments"
					action={
						stripe.isConnected ? (
							<DoneLabel>Connected</DoneLabel>
						) : (
							<Button
								variant="secondary"
								size="sm"
								className={ACTION_WIDTH}
								onClick={stripe.connect}
								isLoading={stripe.isConnecting}
							>
								Connect Stripe
							</Button>
						)
					}
				/>

				<DeployRow
					index={2}
					title="Copy your plans to production"
					description="Sync every plan and feature from sandbox to production"
					action={
						plans.isCopied ? (
							<DoneLabel>Copied</DoneLabel>
						) : (
							<Button
								variant="secondary"
								size="sm"
								className={ACTION_WIDTH}
								onClick={plans.copyPlans}
								isLoading={plans.isCopying}
							>
								Copy plans
							</Button>
						)
					}
				/>

				<DeployRow
					index={3}
					title="Create a production key"
					description="Generate a live secret key for your production environment"
					action={
						apiKey.apiKey ? (
							// Wider than a button — a key is shown once and is worth
							// reading — but it ends on the same right edge.
							<div className="group flex h-7 w-[228px] items-center gap-1 rounded-md border bg-card pl-2 pr-2.5">
								<span className="min-w-0 flex-1 truncate font-mono text-tiny text-muted-foreground">
									{apiKey.apiKey}
								</span>
								<MiniCopyButton text={apiKey.apiKey} />
							</div>
						) : (
							<Button
								variant="secondary"
								size="sm"
								className={ACTION_WIDTH}
								onClick={apiKey.createApiKey}
								isLoading={apiKey.isCreating}
							>
								Generate key
							</Button>
						)
					}
				/>
			</div>

			<Button
				variant="primary"
				size="sm"
				className={`${ACTION_WIDTH} gap-2 self-end mr-3`}
				onClick={production.goToProduction}
				isLoading={production.isDeploying}
			>
				Go to production
				<ArrowRightIcon size={12} weight="bold" />
			</Button>
		</div>
	);
}
