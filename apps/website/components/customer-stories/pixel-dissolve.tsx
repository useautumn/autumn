import { cn } from "@/lib/utils";
import {
	type PixelDissolveOptions,
	usePixelDissolve,
} from "./use-pixel-dissolve";

export function PixelDissolve({
	className,
	...options
}: PixelDissolveOptions & { className?: string }) {
	const canvasRef = usePixelDissolve(options);

	if (!(options.width && options.height)) return null;

	return (
		<canvas
			ref={canvasRef}
			className={cn(
				"cs-dissolve pointer-events-none absolute inset-0 z-30 h-full w-full",
				className,
			)}
		/>
	);
}
