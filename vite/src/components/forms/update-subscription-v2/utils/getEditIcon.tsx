import {
	CurrencyDollarIcon,
	HashIcon,
	PackageIcon,
	StackIcon,
	TagIcon,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { EditIconType } from "../types/summary";

export function getEditIcon(iconType: EditIconType, isUpgrade: boolean) {
	const iconProps = {
		size: 14,
		className: cn("shrink-0", isUpgrade ? "text-green-500" : "text-red-500"),
	};
	switch (iconType) {
		case "price":
			return <CurrencyDollarIcon {...iconProps} />;
		case "tier":
			return <StackIcon {...iconProps} />;
		case "usage":
			return <HashIcon {...iconProps} />;
		case "units":
			return <TagIcon {...iconProps} />;
		case "prepaid":
			return <PackageIcon {...iconProps} />;
		default:
			return null;
	}
}
