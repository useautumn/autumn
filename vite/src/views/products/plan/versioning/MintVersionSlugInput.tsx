import { Input } from "@autumn/ui";
import { mintVersionSlugError } from "../utils/versionSlug";
import { PlanChangeFieldLabel } from "./PlanChangeFieldLabel";

/** Names the row this save mints. Optional — blank keeps the server default. */
export function MintVersionSlugInput({
	defaultSlug,
	value,
	onChange,
}: {
	defaultSlug: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const error = mintVersionSlugError({ slug: value });

	return (
		<div className="flex flex-col gap-2 text-sm">
			<div className="flex flex-col gap-0.5">
				<PlanChangeFieldLabel>Version slug</PlanChangeFieldLabel>
				<span className="text-tertiary-foreground text-xs">
					Optional name for the new version. Leave blank to use{" "}
					<span className="font-mono text-foreground">{defaultSlug}</span>.
				</span>
			</div>
			<Input
				aria-invalid={!!error}
				className="w-full"
				onChange={(event) => onChange(event.target.value)}
				placeholder={defaultSlug}
				type="text"
				value={value}
			/>
			{error && (
				<p className="text-xs text-destructive" role="alert">
					{error}
				</p>
			)}
		</div>
	);
}
