import type { FullCustomer } from "@autumn/shared";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@autumn/ui";
import {
	CalendarBlankIcon,
	CaretDownIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useHasSchedule } from "@/components/forms/create-schedule/hooks/useHasSchedule";
import {
	useIsAttachingProduct,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { getInitialScopeEntityId } from "@/hooks/useSheetScopeEntityId";
import { cn } from "@/lib/utils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";

export function AttachProductSheetTrigger() {
	const { setSheet } = useSheetStore();
	const isAttachingProduct = useIsAttachingProduct();
	const { entityId } = useEntity();
	const { customer } = useCusQuery();

	// Label must reflect the scope the sheet will open in, not the page selection.
	const scopeEntityId =
		entityId ?? getInitialScopeEntityId(customer as FullCustomer | undefined);
	const hasSchedule = useHasSchedule({ entityId: scopeEntityId });

	const handleAttachClick = () => {
		setSheet({ type: "attach-product" });
	};

	const handleCreateSchedule = () => {
		setSheet({ type: "create-schedule" });
	};

	return (
		<div
			className={cn(
				"flex items-center",
				isAttachingProduct && "z-90 opacity-70",
			)}
		>
			<Button
				variant="primary"
				size="mini"
				className="gap-1 font-medium rounded-r-none"
				onClick={handleAttachClick}
			>
				<PlusIcon className="size-3.5" />
				Attach Plan
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="primary"
						size="mini"
						className="rounded-l-none border-l-0 px-1.5"
					>
						<CaretDownIcon className="size-3" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" sideOffset={4}>
					<DropdownMenuItem onClick={handleCreateSchedule}>
						<CalendarBlankIcon className="size-4" />
						{hasSchedule ? "Update Schedule" : "Create Schedule"}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
