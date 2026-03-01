import { Check, Copy } from "lucide-react";
import React from "react";
import CopyButton from "./CopyButton";

const EMPTY_COPY_PROPS: React.ComponentProps<typeof Copy> = {};

export function CopyablePre({ text }: { text: string }) {
	return (
		<div className="relative w-full">
			<pre className="text-sm bg-muted/50 p-4 rounded-lg overflow-auto border w-full h-full">
				<CopyButton text={text} className="absolute top-2 right-2 z-10" />
				<code className="text-sm block w-full break-words whitespace-pre-wrap">
					{text}
				</code>
			</pre>
		</div>
	);
}

// A compact, inline version for use in places like badges or small UI elements.
export function CopyableSpan({
	text,
	className = "",
	copySize = 20,
	copyProps = EMPTY_COPY_PROPS,
}: {
	text: string;
	className?: string;
	copySize?: number;
	copyProps?: React.ComponentProps<typeof import("lucide-react").Copy>;
}) {
	const [copied, setCopied] = React.useState(false);

	React.useEffect(() => {
		if (copied) {
			setTimeout(() => {
				setCopied(false);
			}, 1000);
		}
	}, [copied]);

	const handleClick = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		navigator.clipboard.writeText(text);
		setCopied(true);
	};

	return (
		<span
			role="button"
			tabIndex={0}
			className={
				`inline-flex items-center rounded-xl bg-muted/50 pl-3 py-1 text-md font-mono text-muted-foreground relative font-normal gap-1 cursor-pointer transition-opacity ${
					copied ? "opacity-30" : ""
				}` + (className ? ` ${className}` : "")
			}
			onClick={handleClick}
			onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleClick(e as unknown as React.MouseEvent); }}
		>
			<span className="pr-2">{text}</span>
			<div className="ml-1 p-0.5 rounded transition bg-transparent size-6 z-[1] static bg-none shadow-none border-none flex items-center justify-center">
				{copied ? (
					<Check size={copySize} className="text-muted-foreground" />
				) : (
					<Copy size={copySize} className="text-muted-foreground" />
				)}
			</div>
		</span>
	);
}
