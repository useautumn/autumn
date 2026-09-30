import { IconButton } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { Trash2 } from "lucide-react";
import { ROW_ACTIONS_REVEAL, ROW_LAYOUT } from "./rolloutRowStyles";
import type {
	RolloutCustomer,
	RolloutCustomerName,
	RolloutOrg,
} from "./rolloutTypes";
import { useNow } from "./useNow";

export const CUSTOMER_ROW_COLUMNS =
	"md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px_40px]";

type PinStatus = { label: string; pending: boolean };

const pinStatus = ({
	customer,
	settleMs,
	now,
}: {
	customer: RolloutCustomer;
	settleMs: number;
	now: number;
}): PinStatus => {
	if (customer.removedAt !== undefined) {
		const secondsLeft = Math.ceil(
			(customer.removedAt + settleMs - now) / 1_000,
		);
		return secondsLeft > 0
			? { label: `Leaving in ${secondsLeft}s`, pending: true }
			: { label: "Off the worker", pending: false };
	}
	const joinsAt = customer.addedAt + settleMs;
	const secondsLeft = Math.ceil((joinsAt - now) / 1_000);
	return secondsLeft > 0
		? { label: `Joining in ${secondsLeft}s`, pending: true }
		: {
				label: `On the worker ${formatDistanceToNowStrict(joinsAt, { addSuffix: true })}`,
				pending: false,
			};
};

const PinStatusLabel = ({
	customer,
	settleMs,
}: {
	customer: RolloutCustomer;
	settleMs: number;
}) => {
	const changedAt = customer.removedAt ?? customer.addedAt;
	const now = useNow({ active: Date.now() < changedAt + settleMs });
	const { label, pending } = pinStatus({ customer, settleMs, now });

	return (
		<span className="flex items-center gap-2 text-tiny tabular-nums text-subtle">
			{label}
			<span
				className={cn(
					"inline-flex size-2 rounded-full",
					pending ? "bg-yellow-500" : "bg-green-500",
				)}
			/>
		</span>
	);
};

/** One pinned customer: its org, its id, where its last add or removal stands, and remove. */
export const RolloutCustomerRow = ({
	orgId,
	org,
	customerId,
	customerName,
	customer,
	settleMs,
	onRemove,
}: {
	orgId: string;
	org?: RolloutOrg;
	customerId: string;
	customerName?: RolloutCustomerName;
	customer: RolloutCustomer;
	settleMs: number;
	onRemove: () => void;
}) => (
	<div
		className={cn(
			"group hover:bg-interactive-secondary-hover",
			ROW_LAYOUT,
			CUSTOMER_ROW_COLUMNS,
		)}
	>
		<div className="order-3 min-w-0 md:order-none">
			<p className="truncate text-xs text-tertiary-foreground md:text-sm md:text-foreground">
				{org?.name ?? orgId}
			</p>
			<p className="hidden truncate font-mono text-tiny text-tertiary-foreground md:block">
				{org ? `${org.slug} · ${org.id}` : orgId}
			</p>
		</div>
		<div className="order-1 min-w-0 md:order-none">
			<p className="truncate text-sm text-foreground">
				{customerName?.name ?? customerId}
			</p>
			<p className="truncate font-mono text-tiny text-tertiary-foreground">
				{customerName?.email
					? `${customerId} · ${customerName.email}`
					: customerId}
			</p>
		</div>
		<div className="order-4 justify-self-end md:order-none md:justify-self-start">
			<PinStatusLabel customer={customer} settleMs={settleMs} />
		</div>
		<div
			className={cn(
				"order-2 flex justify-end md:order-none",
				ROW_ACTIONS_REVEAL,
			)}
		>
			{customer.removedAt === undefined && (
				<IconButton
					icon={<Trash2 className="size-3.5" />}
					variant="secondary"
					size="sm"
					onClick={onRemove}
					aria-label={`Remove ${customerId}`}
				/>
			)}
		</div>
	</div>
);
