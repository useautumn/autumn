import StackBadge from "@/components/v2/badges/StackBadge";
import { STACK_SECTIONS } from "@/lib/snippets/stackOptionsConfig";
import type { StackConfig } from "@/lib/snippets/types";

interface StackSelectorProps {
	stackConfig: StackConfig;
	onStackConfigChange: (config: StackConfig) => void;
	className?: string;
}

export function StackSelector({
	stackConfig,
	onStackConfigChange,
	className,
}: StackSelectorProps) {
	return (
		<div className={className}>
			<div className="flex flex-col gap-4">
				{STACK_SECTIONS.map((section) => (
					<div key={section.configKey} className="flex flex-col gap-2">
						<h4 className="text-xs font-medium text-t3">{section.label}</h4>
						<div className="flex flex-row gap-1.5 flex-wrap">
							{section.options.map((option) => (
								<StackBadge
									key={option.value}
									stack={option.label}
									asset={option.asset}
									icon={option.icon}
									isSelected={stackConfig[section.configKey] === option.value}
									onSelectedChange={() =>
										onStackConfigChange({
											...stackConfig,
											[section.configKey]: option.value,
										})
									}
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
