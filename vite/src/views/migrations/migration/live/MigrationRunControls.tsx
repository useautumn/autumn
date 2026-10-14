import { MIGRATION_WEBHOOK_EVENT_TYPES } from "@autumn/shared";
import { Input, Separator, Switch } from "@autumn/ui";
import { useWebhookSubscriptionsQuery } from "@/hooks/queries/useWebhookSubscriptionsQuery";
import {
	MAX_MIGRATION_WEBHOOK_CONCURRENCY,
	type MigrationRunControlsState,
} from "../hooks/useMigrationRunControls";

type ControlRowProps = {
	title: string;
	description: string;
	children: React.ReactNode;
};

function ControlRow({ title, description, children }: ControlRowProps) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="flex flex-col gap-0.5">
				<span className="text-sm font-medium text-foreground">{title}</span>
				<span className="text-xs text-tertiary-foreground">{description}</span>
			</div>
			{children}
		</div>
	);
}

export function MigrationRunControls({
	value,
	onChange,
	hasFailedItems = false,
	hasSkippedItems = false,
	webhooksOnByDefault,
	batchEligible,
}: {
	value: MigrationRunControlsState;
	onChange: (value: MigrationRunControlsState) => void;
	hasFailedItems?: boolean;
	hasSkippedItems?: boolean;
	webhooksOnByDefault: boolean;
	batchEligible: boolean;
}) {
	const sendWebhooks = value.sendWebhooks ?? webhooksOnByDefault;
	const { isSubscribed } = useWebhookSubscriptionsQuery({
		eventTypes: MIGRATION_WEBHOOK_EVENT_TYPES,
	});
	const retrying = value.retryErrored || value.retrySkipped;
	const showWebhookControls = isSubscribed && batchEligible && !retrying;

	if (!(hasFailedItems || hasSkippedItems || showWebhookControls)) return null;

	return (
		<div className="flex flex-col gap-3">
			<Separator />
			{hasFailedItems && (
				<ControlRow
					title="Retry incomplete"
					description="Re-run customers that didn't complete."
				>
					<Switch
						checked={value.retryErrored}
						onCheckedChange={(checked) =>
							onChange({ ...value, retryErrored: checked === true })
						}
					/>
				</ControlRow>
			)}
			{hasSkippedItems && (
				<ControlRow
					title="Retry skipped"
					description="Re-run customers that were skipped."
				>
					<Switch
						checked={value.retrySkipped}
						onCheckedChange={(checked) =>
							onChange({ ...value, retrySkipped: checked === true })
						}
					/>
				</ControlRow>
			)}
			{showWebhookControls && (
				<>
					<ControlRow
						title="Send webhooks"
						description={
							webhooksOnByDefault
								? "Notify your endpoint for each migrated customer."
								: "Off by default for large runs — turn on to notify your endpoint."
						}
					>
						<Switch
							checked={sendWebhooks}
							onCheckedChange={(checked) =>
								onChange({ ...value, sendWebhooks: checked === true })
							}
						/>
					</ControlRow>
					{sendWebhooks && (
						<ControlRow
							title="Webhook concurrency"
							description={`Parallel deliveries to your endpoint (max ${MAX_MIGRATION_WEBHOOK_CONCURRENCY}).`}
						>
							<Input
								aria-label="Webhook concurrency"
								type="number"
								min={1}
								max={MAX_MIGRATION_WEBHOOK_CONCURRENCY}
								className="h-8 w-20"
								value={value.webhookConcurrency}
								onChange={(event) =>
									onChange({
										...value,
										webhookConcurrency: Math.min(
											Math.max(Number(event.target.value) || 1, 1),
											MAX_MIGRATION_WEBHOOK_CONCURRENCY,
										),
									})
								}
							/>
						</ControlRow>
					)}
				</>
			)}
		</div>
	);
}
