import { type SDKType, useSDKStore } from "@/hooks/stores/useSDKStore";
import { cn } from "@/lib/utils";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./selects/Select";

interface SDKOption {
	value: SDKType;
	label: string;
	icon: string;
}

const SDK_OPTIONS: SDKOption[] = [
	{ value: "react", label: "React", icon: "/frameworks/react.png" },
	{ value: "node", label: "Node.js", icon: "/frameworks/nodejs.svg" },
	{ value: "python", label: "Python", icon: "/frameworks/python.svg" },
	{ value: "curl", label: "cURL", icon: "/frameworks/curl.svg" },
];

interface SDKSelectorProps {
	className?: string;
}

export function SDKSelector({ className }: SDKSelectorProps) {
	const selectedSDK = useSDKStore((s) => s.selectedSDK);
	const setSelectedSDK = useSDKStore((s) => s.setSelectedSDK);

	const selectedOption = SDK_OPTIONS.find((opt) => opt.value === selectedSDK);

	return (
		<Select
			value={selectedSDK}
			onValueChange={(v) => setSelectedSDK(v as SDKType)}
		>
			<SelectTrigger className={cn("min-w-28 h-6!", className)}>
				<SelectValue>
					{selectedOption && (
						<span className="flex items-center gap-2">
							<img
								src={selectedOption.icon}
								alt={selectedOption.label}
								className="size-3 object-contain"
							/>
							{selectedOption.label}
						</span>
					)}
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{SDK_OPTIONS.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						<img
							src={option.icon}
							alt={option.label}
							className="size-4 object-contain"
						/>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
