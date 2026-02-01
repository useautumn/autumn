import { Button } from "@/components/v2/buttons/Button";
import { PRICING_TEMPLATE_PROMPTS } from "../pricingTemplateConfigs";

interface TemplatePromptsProps {
	onSelectTemplate: ({ prompt }: { prompt: string }) => void;
}

export function TemplatePrompts({ onSelectTemplate }: TemplatePromptsProps) {
	return (
		<div className="flex flex-col items-center gap-3 relative z-10 rounded-2xl pt-2 pb-4 px-4 border-border/50">
			{/* Header with decorative lines */}

			<div className="flex items-center gap-3 w-full justify-center">
				<div className="h-px w-8 bg-border border-border/50" />
				<span className=" text-t4 font-normal text-xs">Copy a template</span>
				<div className="h-px w-8 bg-border border-border/50" />
			</div>

			{/* Template cards */}
			<div className="flex items-center justify-center gap-3 flex-wrap">
				{PRICING_TEMPLATE_PROMPTS.map((template) => (
					<Button
						key={template.id}
						type="button"
						onClick={() => onSelectTemplate({ prompt: template.prompt })}
						variant="secondary"
						className="h-9! px-3! gap-3"
					>
						<img
							src={template.icon}
							alt={template.label}
							className="size-4 object-contain opacity-50 dark:invert"
						/>
						<span className="text-sm font-medium text-t2">
							{template.label}
						</span>
					</Button>
				))}
			</div>
		</div>
	);
}
