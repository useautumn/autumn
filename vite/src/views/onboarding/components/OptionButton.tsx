import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export default function OptionButton({
	title,
	selected,
	onClick,
}: {
	title: string;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			className={cn(
				"px-4 py-2.5 text-sm transition-colors",
				selected
					? "bg-code-bg text-white"
					: "text-white/60 hover:text-white/80",
			)}
			onClick={onClick}
		>
			{title}
		</button>
	);
}

export function CopyButton({ content }: { content: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(content);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			className="p-2.5 text-white/60 hover:text-white/80 transition-colors"
			onClick={handleCopy}
		>
			{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
		</button>
	);
}
