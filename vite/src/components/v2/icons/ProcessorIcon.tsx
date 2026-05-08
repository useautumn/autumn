import { ProcessorType } from "@autumn/shared";
import { CoinVerticalIcon } from "@phosphor-icons/react";
import { RevenueCatIcon } from "@/components/v2/icons/AutumnIcons";

type ProcessorVariant = ProcessorType | "vercel";

type ProcessorIconProps = {
	processor: ProcessorVariant;
	size?: number;
	className?: string;
};

export function ProcessorIcon({
	processor,
	size = 14,
	className,
}: ProcessorIconProps) {
	if (processor === ProcessorType.RevenueCat) {
		return (
			<span className={className}>
				<RevenueCatIcon size={size} />
			</span>
		);
	}

	if (processor === "vercel") {
		return (
			<svg
				fill="currentColor"
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 1155 1000"
				width={size}
				height={size}
				className={className}
			>
				<title>Vercel</title>
				<path d="m577.3 0 577.4 1000H0z" />
			</svg>
		);
	}

	return <CoinVerticalIcon size={size} weight="fill" className={className} />;
}
