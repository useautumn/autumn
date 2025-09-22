import CopyButton from "./CopyButton";

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
export function CopyableSpan({ text, className = "" }: { text: string; className?: string }) {
	return (
		<span
			className={
				`inline-flex items-center rounded-xl bg-muted/50 px-4 py-1 text-md font-mono text-muted-foreground relative font-normal gap-1` +
				(className ? ` ${className}` : "")
			}
		>
			<span className="pr-2">{text}</span>
			<CopyButton
				text={text}
				className="ml-1 p-0.5 rounded transition hover:bg-muted/80 w-6 h-6 z-[1] static"
				copySize={20}
			/>
		</span>
	);
}
