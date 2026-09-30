import { cn } from "@autumn/ui/lib/utils";
import { CUSTOMER_ROW_COLUMNS, RolloutCustomerRow } from "./RolloutCustomerRow";
import { LIST_EMPTY, LIST_FRAME, ROW_HEADER_LAYOUT } from "./rolloutRowStyles";
import type {
	RolloutCustomerName,
	RolloutCustomerPin,
	RolloutOrg,
} from "./rolloutTypes";

/** Every pinned customer, or the note that there are none. */
export const RolloutCustomerList = ({
	customerPins,
	orgsById,
	customerNamesByOrgId,
	settleMs,
	onRemove,
}: {
	customerPins: RolloutCustomerPin[];
	orgsById: Record<string, RolloutOrg>;
	customerNamesByOrgId: Record<string, Record<string, RolloutCustomerName>>;
	settleMs: number;
	onRemove: ({
		orgId,
		customerId,
	}: {
		orgId: string;
		customerId: string;
	}) => void;
}) => (
	<div className={LIST_FRAME}>
		{customerPins.length === 0 ? (
			<div className={LIST_EMPTY}>No customer overrides.</div>
		) : (
			<>
				<div className={cn(ROW_HEADER_LAYOUT, CUSTOMER_ROW_COLUMNS)}>
					<span>Org</span>
					<span>Customer</span>
					<span>Status</span>
					<span />
				</div>
				{customerPins.map(({ orgId, customerId, customer }) => (
					<RolloutCustomerRow
						key={`${orgId}:${customerId}`}
						orgId={orgId}
						org={orgsById[orgId]}
						customerId={customerId}
						customerName={customerNamesByOrgId[orgId]?.[customerId]}
						customer={customer}
						settleMs={settleMs}
						onRemove={() => onRemove({ orgId, customerId })}
					/>
				))}
			</>
		)}
	</div>
);
