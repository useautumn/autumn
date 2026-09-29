import { IconButton } from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { Trash2 } from "lucide-react";
import type {
	RolloutCustomer,
	RolloutCustomerName,
	RolloutOrg,
} from "./rolloutTypes";
import { useNow } from "./useNow";

export const CUSTOMER_ROW_GRID =
	"grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px_40px] items-center gap-4 px-4";

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

/** One pinned customer: its org, its id, where its last add or removal stands, and remove on hover. */
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
		className={`group h-12 hover:bg-interactive-secondary-hover ${CUSTOMER_ROW_GRID}`}
	>
		<div className="min-w-0">
			<p className="truncate text-sm text-foreground">{org?.name ?? orgId}</p>
			<p className="truncate font-mono text-tiny text-tertiary-foreground">
				{org ? `${org.slug} · ${org.id}` : orgId}
			</p>
		</div>
		<div className="min-w-0">
			<p className="truncate text-sm text-foreground">
				{customerName?.name ?? customerId}
			</p>
			<p className="truncate font-mono text-tiny text-tertiary-foreground">
				{customerName?.email
					? `${customerId} · ${customerName.email}`
					: customerId}
			</p>
		</div>
		<PinStatusLabel customer={customer} settleMs={settleMs} />
		<div className="flex justify-end opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
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
