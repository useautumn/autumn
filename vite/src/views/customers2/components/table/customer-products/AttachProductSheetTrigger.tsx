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
import { useCanDo } from "@/hooks/queries/useCanDo";
import {
	useIsAttachingProduct,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { cn } from "@/lib/utils";
import { useOpenSetPlans } from "@/views/customers2/components/sheets/set-plans-subscription/hooks/useOpenSetPlans";
import { usePrefetchSetPlans } from "@/views/customers2/components/sheets/set-plans-subscription/hooks/usePrefetchSetPlans";

export function AttachProductSheetTrigger() {
	const { setSheet } = useSheetStore();
	const isAttachingProduct = useIsAttachingProduct();

	const handleAttachClick = () => {
		setSheet({ type: "attach-product" });
	};

	const openSetPlans = useOpenSetPlans();
	usePrefetchSetPlans();
	const canAttach = useCanDo("billing.attach");
	const canSetPlans = useCanDo("billing.set_plans");

	if (!canAttach && !canSetPlans) return null;
	if (!canAttach) {
		return (
			<Button
				variant="primary"
				size="mini"
				className="gap-1 font-medium"
				onClick={openSetPlans}
			>
				<CalendarBlankIcon className="size-3.5" />
				Set Plans
			</Button>
		);
	}

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
				className={cn("gap-1 font-medium", canSetPlans && "rounded-r-none")}
				onClick={handleAttachClick}
			>
				<PlusIcon className="size-3.5" />
				Attach Plan
			</Button>
			{canSetPlans && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="primary"
							size="mini"
							className="rounded-l-none border-l-0 px-1.5"
							aria-label="More plan actions"
						>
							<CaretDownIcon className="size-3" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" sideOffset={4}>
						<DropdownMenuItem onClick={openSetPlans}>
							<CalendarBlankIcon className="size-4" />
							Set Plans
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</div>
	);
}
