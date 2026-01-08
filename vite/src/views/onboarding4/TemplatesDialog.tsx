import { useState } from "react";
import { useNavigate } from "react-router";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/v2/dialogs/Dialog";
import { cn } from "@/lib/utils";
import { pushPage } from "@/utils/genUtils";
import { TemplateDetailView } from "./TemplateDetailView";
import { TEMPLATE_CONFIGS, type TemplateConfig } from "./templateConfigs";

interface TemplateCardProps {
	template: TemplateConfig;
	onClick: () => void;
}

function TemplateCard({ template, onClick }: TemplateCardProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-col items-start gap-2 p-4 rounded-lg border bg-card",
				"text-left transition-colors",
				"hover:border-primary hover:bg-interactive-secondary-hover",
				"focus-visible:outline-none focus-visible:border-primary",
			)}
		>
			<span className="text-sm font-medium text-foreground">
				{template.name}
			</span>
			<div className="flex flex-wrap gap-1.5">
				{template.tags.slice(0, 2).map((tag) => (
					<span
						key={tag}
						className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-interactive-secondary text-t3"
					>
						{tag}
					</span>
				))}
				{template.tags.length > 2 && (
					<span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-interactive-secondary text-t3">
						+{template.tags.length - 2}
					</span>
				)}
			</div>
		</button>
	);
}

interface TemplatesDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function TemplatesDialog({ open, onOpenChange }: TemplatesDialogProps) {
	const navigate = useNavigate();
	const [selectedTemplate, setSelectedTemplate] =
		useState<TemplateConfig | null>(null);

	const handleClose = (isOpen: boolean) => {
		if (!isOpen) {
			setSelectedTemplate(null);
		}
		onOpenChange(isOpen);
	};

	const handleCopyPlans = () => {
		handleClose(false);
		pushPage({ path: "/products", navigate });
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent
				className={cn(
					"transition-all duration-200",
					selectedTemplate ? "max-w-3xl" : "max-w-2xl",
				)}
			>
				{selectedTemplate ? (
					<TemplateDetailView
						template={selectedTemplate}
						onBack={() => setSelectedTemplate(null)}
						onCopyPlans={handleCopyPlans}
					/>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Choose a template</DialogTitle>
						</DialogHeader>
						<div className="grid grid-cols-3 gap-3 mt-2">
							{TEMPLATE_CONFIGS.map((template) => (
								<TemplateCard
									key={template.id}
									template={template}
									onClick={() => setSelectedTemplate(template)}
								/>
							))}
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
