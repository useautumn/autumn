import { Input, Popover, PopoverContent, PopoverTrigger } from "@autumn/ui";
import { WarningIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { defaultVersionSlug } from "../components/versionLabel";
import { mintTargetSlugError } from "./mintTargetSlugs";

/**
 * Names the row a propagation target mints. Sits in the row's trailing slot so the
 * chip reads as this target's resulting version, with editing one click away.
 */
export function TargetVersionSlugControl({
	slug,
	mintVersion,
	takenSlugs,
	onChange,
}: {
	slug: string;
	mintVersion: number;
	takenSlugs: string[];
	onChange: (slug: string) => void;
}) {
	const fallbackSlug = defaultVersionSlug({ version: mintVersion });
	const error = mintTargetSlugError({ slug, takenSlugs });
	const trimmed = slug.trim();

	return (
		<Popover>
			<PopoverTrigger
				className={cn(
					"flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 font-mono text-xs transition-colors",
					error
						? "text-amber-600 hover:bg-amber-500/10 dark:text-amber-500"
						: "text-tertiary-foreground hover:bg-secondary hover:text-foreground",
				)}
			>
				{error && <WarningIcon size={11} weight="fill" />}
				{trimmed || fallbackSlug}
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="flex w-64 flex-col gap-2 rounded-lg border-none bg-interactive-secondary p-3 shadow-md ring-1 ring-foreground/10"
				side="right"
			>
				<div className="flex flex-col gap-0.5">
					<span className="font-medium text-foreground text-xs">
						Version slug
					</span>
					<span className="text-tertiary-foreground text-xs">
						Names this plan's new v{mintVersion}. Blank uses{" "}
						<span className="font-mono text-foreground">{fallbackSlug}</span>.
					</span>
				</div>
				<Input
					aria-invalid={!!error}
					autoFocus
					className="w-full"
					onChange={(event) => onChange(event.target.value)}
					placeholder={fallbackSlug}
					type="text"
					value={slug}
				/>
				{error && (
					<p
						className="text-amber-600 text-xs dark:text-amber-500"
						role="alert"
					>
						{error}
					</p>
				)}
			</PopoverContent>
		</Popover>
	);
}
