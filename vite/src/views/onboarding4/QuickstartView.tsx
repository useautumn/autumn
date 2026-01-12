import { LayoutTemplate, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AIChatView } from "./AIChatView";
import { TemplatesDialog } from "./TemplatesDialog";

type ViewMode = "welcome" | "chat";

interface OptionCardProps {
	icon: React.ReactNode;
	title: string;
	description: string;
	onClick: () => void;
}

function OptionCard({ icon, title, description, onClick }: OptionCardProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex flex-col items-start gap-3 p-5 rounded-xl border bg-card",
				"w-64 text-left transition-colors",
				"hover:border-primary hover:bg-interactive-secondary-hover",
				"focus-visible:outline-none focus-visible:border-primary",
			)}
		>
			<div className="p-2.5 rounded-lg bg-interactive-secondary border">
				{icon}
			</div>
			<div className="flex flex-col gap-1">
				<span className="text-sm font-medium text-foreground">{title}</span>
				<span className="text-xs text-t3">{description}</span>
			</div>
		</button>
	);
}

export default function QuickstartView() {
	const [viewMode, setViewMode] = useState<ViewMode>("welcome");
	const [templatesOpen, setTemplatesOpen] = useState(false);

	if (viewMode === "chat") {
		return <AIChatView onBack={() => setViewMode("welcome")} />;
	}

	return (
		<div className="w-full h-full flex items-center justify-center bg-background">
			<TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />

			<div className="flex flex-col items-center gap-8">
				<h1 className="text-3xl font-semibold text-foreground">
					Welcome to Autumn
				</h1>

				<div className="flex gap-4">
					<OptionCard
						icon={<LayoutTemplate className="size-5 text-t2" />}
						title="Browse templates"
						description="Start from a pre-built pricing model"
						onClick={() => setTemplatesOpen(true)}
					/>
					<OptionCard
						icon={<MessageSquareText className="size-5 text-t2" />}
						title="Describe your pricing"
						description="Let AI help you build your pricing"
						onClick={() => setViewMode("chat")}
					/>
				</div>
			</div>
		</div>
	);
}
