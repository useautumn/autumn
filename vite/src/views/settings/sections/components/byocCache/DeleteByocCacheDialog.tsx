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
import { useId } from "react";
import { useAppForm } from "@/hooks/form/form";
import type { ByocCacheRemovalDisplay } from "./byocCacheStatusDisplay";

/** A removal that loses something only runs once `confirmPhrase` is typed out. */
export const DeleteByocCacheDialog = ({
	removal,
	confirmPhrase,
	open,
	onOpenChange,
	onConfirm,
}: {
	removal: ByocCacheRemovalDisplay;
	confirmPhrase: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => Promise<void>;
}) => {
	const losesSomething = removal.consequences.length > 0;
	const inputId = useId();
	const form = useAppForm({
		defaultValues: { typed: "" },
		onSubmit: onConfirm,
	});

	const changeOpen = (nextOpen: boolean) => {
		if (!nextOpen) form.reset();
		onOpenChange(nextOpen);
	};

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogContent className="max-w-[440px]">
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						form.handleSubmit();
					}}
				>
					<DialogHeader>
						<DialogTitle>{removal.action}</DialogTitle>
						<DialogDescription>{removal.description}</DialogDescription>
					</DialogHeader>

					{losesSomething && (
						<>
							<ul className="flex flex-col gap-1.5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
								{removal.consequences.map((consequence) => (
									<li key={consequence} className="flex gap-2">
										<span aria-hidden="true">·</span>
										{consequence}
									</li>
								))}
							</ul>
							<form.Field name="typed">
								{(field) => (
									<div className="flex flex-col gap-1.5">
										<label
											htmlFor={inputId}
											className="text-xs font-medium text-muted-foreground"
										>
											Type{" "}
											<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
												{confirmPhrase}
											</code>{" "}
											to confirm
										</label>
										<Input
											id={inputId}
											autoComplete="off"
											value={field.state.value}
											onChange={(event) =>
												field.handleChange(event.target.value)
											}
										/>
									</div>
								)}
							</form.Field>
						</>
					)}

					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => changeOpen(false)}
						>
							Keep it
						</Button>
						<form.Subscribe
							selector={(state) =>
								[state.values.typed, state.isSubmitting] as const
							}
						>
							{([typed, isSubmitting]) => (
								<Button
									type="submit"
									variant="destructive"
									disabled={losesSomething && typed !== confirmPhrase}
									isLoading={isSubmitting}
								>
									{removal.action}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};
