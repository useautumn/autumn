import { getFeatureName } from "@autumn/shared";
import {
	CalendarBlankIcon,
	CaretDownIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import { useHasSchedule } from "@/components/forms/create-schedule/hooks/useHasSchedule";
import { Button } from "@/components/v2/buttons/Button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/v2/dropdowns/DropdownMenu";
import { useFeaturesQuery } from "@/hooks/queries/useFeaturesQuery";
import {
	useIsAttachingProduct,
	useSheetStore,
} from "@/hooks/stores/useSheetStore";
import { useEntity } from "@/hooks/stores/useSubscriptionStore";
import { cn } from "@/lib/utils";

export function AttachProductSheetTrigger() {
	const { setSheet } = useSheetStore();
	const isAttachingProduct = useIsAttachingProduct();
	const { entity } = useEntity();
	const features = useFeaturesQuery();
	const hasSchedule = useHasSchedule();

	const feature = features.features.find((f) => f.id === entity?.feature_id);

	const handleAttachClick = () => {
		setSheet({ type: "attach-product-v2" });
	};

	const handleCreateSchedule = () => {
		setSheet({ type: "create-schedule" });
	};

	const entitySuffix = entity
		? ` to ${getFeatureName({ feature, plural: false, capitalize: false })}`
		: "";

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
				Attach Plan{entitySuffix}
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
