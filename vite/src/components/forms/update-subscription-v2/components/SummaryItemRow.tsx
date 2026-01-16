import type { EditIconType, ItemEdit } from "@autumn/shared";
import {
	CalendarIcon,
	CurrencyDollarIcon,
	GitBranchIcon,
	HashIcon,
	PackageIcon,
	StackIcon,
	TagIcon,
	WrenchIcon,
} from "@phosphor-icons/react";

function getIcon(iconType: EditIconType) {
	const iconProps = { size: 16, weight: "duotone" as const };
	switch (iconType) {
		case "trial":
			return (
				<div className="text-blue-500">
					<CalendarIcon {...iconProps} />
				</div>
			);
		case "version":
			return (
				<div className="text-purple-500">
					<GitBranchIcon {...iconProps} />
				</div>
			);
		case "item":
			return (
				<div className="text-amber-500">
					<WrenchIcon {...iconProps} />
				</div>
			);
		case "prepaid":
			return (
				<div className="text-cyan-500">
					<PackageIcon {...iconProps} />
				</div>
			);
		case "price":
			return (
				<div className="text-green-500">
					<CurrencyDollarIcon {...iconProps} />
				</div>
			);
		case "tier":
			return (
				<div className="text-orange-500">
					<StackIcon {...iconProps} />
				</div>
			);
		case "usage":
			return (
				<div className="text-indigo-500">
					<HashIcon {...iconProps} />
				</div>
			);
		case "units":
			return (
				<div className="text-pink-500">
					<TagIcon {...iconProps} />
				</div>
			);
		default:
			return null;
	}
}

export function SummaryItemRow({ item }: { item: ItemEdit }) {
	const renderChangeIndicator = () => {
		if (item.newValue === null) {
			return (
				<span className="bg-red-500/10 text-red-500 px-2 py-0.5 rounded-md text-xs font-medium">
					Remove
				</span>
			);
		}

		if (item.oldValue !== null && item.oldValue !== item.newValue) {
			const isVersion = item.type === "version";
			const formatValue = (value: string | number) =>
				isVersion ? `v${value}` : value;

			return (
				<span className="px-2 py-0.5 rounded-md text-xs flex items-center gap-1">
					<span className="text-red-500">{formatValue(item.oldValue)}</span>
					<span className="text-t3">→</span>
					<span className="text-green-500">{formatValue(item.newValue)}</span>
				</span>
			);
		}

		if (item.oldValue === null) {
			return (
				<span className="bg-green-500/10 text-green-500 px-2 py-0.5 rounded-md text-xs font-medium">
					{item.newValue}
				</span>
			);
		}

		return null;
	};

	return (
		<div className="flex items-center w-full h-10 px-3 rounded-xl input-base">
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
				{getIcon(item.icon)}

				<p className="whitespace-nowrap truncate flex-1 min-w-0 text-body">
					{item.label}
				</p>
			</div>

			<div className="flex items-center gap-2 shrink-0">
				{renderChangeIndicator()}
			</div>
		</div>
	);
}
