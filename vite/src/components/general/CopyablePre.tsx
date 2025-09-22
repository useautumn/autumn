import { Button } from "../ui/button";
import { Copy } from "lucide-react";
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
