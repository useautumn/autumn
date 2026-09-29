import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
} from "@autumn/ui";
import { cn } from "@autumn/ui/lib/utils";
import { useForm } from "@tanstack/react-form";
import { OrgSearchResults } from "./OrgSearchResults";
import {
	isValidPercent,
	PERCENT_PRESETS,
	type RolloutOrg,
} from "./rolloutTypes";

const RolloutOrgForm = ({
	onSubmit,
	onCancel,
	isSaving,
}: {
	onSubmit: ({ orgId, percent }: { orgId: string; percent: number }) => void;
	onCancel: () => void;
	isSaving: boolean;
}) => {
	const form = useForm({
		defaultValues: { search: "", org: null as RolloutOrg | null, percent: 0 },
		onSubmit: ({ value }) => {
			if (!value.org) return;
			onSubmit({ orgId: value.org.id, percent: value.percent });
		},
	});

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
		>
			<form.Field name="search">
				{(field) => (
					<div className="flex flex-col gap-2">
						<label
							className="text-xs font-medium text-muted-foreground"
							htmlFor="org-search"
						>
							Organization
						</label>
						<Input
							id="org-search"
							placeholder="Search organizations"
							value={field.state.value}
							onChange={(event) => field.handleChange(event.target.value)}
							autoFocus
						/>
						<form.Field name="org">
							{(orgField) => (
								<OrgSearchResults
									search={field.state.value}
									selectedOrgId={orgField.state.value?.id ?? ""}
									onSelect={orgField.handleChange}
								/>
							)}
						</form.Field>
					</div>
				)}
			</form.Field>

			<form.Field
				name="percent"
				validators={{
					onChange: ({ value }) =>
						isValidPercent(value)
							? undefined
							: "Enter a whole number from 0 to 100",
				}}
			>
				{(field) => (
					<div className="flex flex-col gap-2">
						<span className="text-xs font-medium text-muted-foreground">
							Percent
						</span>
						<div className="flex flex-wrap gap-1.5">
							{PERCENT_PRESETS.map((preset) => (
								<button
									type="button"
									key={preset}
									onClick={() => field.handleChange(preset)}
									className={cn(
										"rounded-md border px-2.5 py-1 font-mono text-xs tabular-nums transition-colors",
										field.state.value === preset
											? "border-primary bg-primary/10 text-foreground"
											: "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
									)}
								>
									{preset}%
								</button>
							))}
							<Input
								type="number"
								min={0}
								max={100}
								step={1}
								value={field.state.value}
								onChange={(event) =>
									field.handleChange(Number(event.target.value))
								}
								className="h-8 w-20 font-mono tabular-nums"
								aria-label="Percent"
							/>
						</div>
						{field.state.meta.errors.length > 0 && (
							<p role="alert" className="text-xs text-destructive">
								{field.state.meta.errors.join(" ")}
							</p>
						)}
					</div>
				)}
			</form.Field>

			<DialogFooter>
				<Button
					type="button"
					variant="secondary"
					onClick={onCancel}
					disabled={isSaving}
				>
					Cancel
				</Button>
				<form.Subscribe
					selector={(state) => [state.values.org, state.canSubmit] as const}
				>
					{([org, canSubmit]) => (
						<Button
							type="submit"
							isLoading={isSaving}
							disabled={!org || !canSubmit}
						>
							{org ? `Add ${org.name || org.id}` : "Add org"}
						</Button>
					)}
				</form.Subscribe>
			</DialogFooter>
		</form>
	);
};

/** Pick an org and the percent it starts at; the form resets by remounting on open. */
export const RolloutOrgDialog = ({
	open,
	onOpenChange,
	onSubmit,
	isSaving,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSubmit: ({ orgId, percent }: { orgId: string; percent: number }) => void;
	isSaving: boolean;
}) => (
	<Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
		<DialogContent className="max-w-lg">
			<DialogHeader>
				<DialogTitle>Add org override</DialogTitle>
				<DialogDescription>
					The org follows its own percent instead of the global one until the
					override is removed.
				</DialogDescription>
			</DialogHeader>
			{open && (
				<RolloutOrgForm
					onSubmit={onSubmit}
					onCancel={() => onOpenChange(false)}
					isSaving={isSaving}
				/>
			)}
		</DialogContent>
	</Dialog>
);
