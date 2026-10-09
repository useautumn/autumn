import type { ByocCacheMachine } from "@autumn/shared";
import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { useAppForm } from "@/hooks/form/form";
import { AtomMachineCard } from "./AtomMachineCard";
import { ATOM_RESIZE_NOTE, atomMachineLabel } from "./atomMachineDisplay";

/** Nothing resizes until the user ticks that Atom will be briefly unavailable. */
export const ResizeAtomDialog = ({
	open,
	onOpenChange,
	current,
	target,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Null when Atom runs on a machine Autumn does not offer. */
	current: ByocCacheMachine | null;
	target: ByocCacheMachine;
	onConfirm: () => Promise<void>;
}) => {
	const form = useAppForm({
		defaultValues: { acknowledged: false },
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
						<DialogTitle>Resize Atom</DialogTitle>
						<DialogDescription>
							Moves Atom to a new machine in your AWS account.
						</DialogDescription>
					</DialogHeader>

					<div className="flex items-center gap-2">
						{current && (
							<>
								<AtomMachineCard caption="Current" machine={current} />
								<ArrowRightIcon className="size-3.5 shrink-0 text-subtle" />
							</>
						)}
						<AtomMachineCard caption="New" machine={target} isTarget />
					</div>

					<p className="text-sm text-tertiary-foreground">{ATOM_RESIZE_NOTE}</p>

					<form.AppField name="acknowledged">
						{(field) => (
							<field.CheckboxField
								label="I understand Atom is unavailable for up to a minute"
								labelClassName="text-sm text-muted-foreground"
								hideFieldInfo
							/>
						)}
					</form.AppField>

					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => changeOpen(false)}
						>
							Cancel
						</Button>
						<form.Subscribe
							selector={(state) =>
								[state.values.acknowledged, state.isSubmitting] as const
							}
						>
							{([acknowledged, isSubmitting]) => (
								<Button
									type="submit"
									variant="primary"
									disabled={!acknowledged}
									isLoading={isSubmitting}
								>
									Resize to {atomMachineLabel(target)}
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
};
