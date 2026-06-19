import { useDeferredValue, useMemo, useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { PhosphorIcon } from "@/components/v2/icons/PhosphorIcon";
import {
	PHOSPHOR_ICON_NAMES,
	STARTER_PHOSPHOR_ICONS,
} from "@/components/v2/icons/phosphorIcons";
import { Input } from "@/components/v2/inputs/Input";
import { cn } from "@/lib/utils";

const MAX_RESULTS = 60;

const humanize = (name: string) =>
	name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

export function IconPicker({
	value,
	onChange,
}: {
	value?: string;
	onChange: (name: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const deferredQuery = useDeferredValue(query);

	const matches = useMemo(() => {
		const q = deferredQuery.trim().toLowerCase();
		if (!q) return STARTER_PHOSPHOR_ICONS;
		return PHOSPHOR_ICON_NAMES.filter((name) =>
			humanize(name).includes(q),
		).slice(0, MAX_RESULTS);
	}, [deferredQuery]);

	const select = (name: string) => {
		onChange(name);
		setOpen(false);
		setQuery("");
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Select icon"
					className="flex size-7 items-center justify-center rounded-lg border bg-interactive-secondary text-foreground transition-colors hover:bg-interactive-secondary-hover"
				>
					<PhosphorIcon name={value} className="size-4" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-2">
				<Input
					placeholder="Search icons"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="mb-2 h-8"
				/>
				<div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
					{matches.map((name) => (
						<button
							key={name}
							type="button"
							aria-label={humanize(name)}
							onClick={() => select(name)}
							className={cn(
								"flex aspect-square items-center justify-center rounded-md text-tertiary-foreground transition-colors hover:bg-interactive-secondary-hover hover:text-foreground",
								value === name &&
									"bg-interactive-secondary-hover text-foreground ring-1 ring-primary",
							)}
						>
							<PhosphorIcon name={name} className="size-4" />
						</button>
					))}
					{matches.length === 0 && (
						<p className="col-span-6 py-4 text-center text-xs text-tertiary-foreground">
							No icons found
						</p>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
