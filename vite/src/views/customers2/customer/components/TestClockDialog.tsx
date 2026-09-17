import {
	Button,
	DateInputUnix,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@autumn/ui";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { getBackendErr } from "@/utils/genUtils";
import { useCusQuery } from "@/views/customers/customer/hooks/useCusQuery";
import { getTestClockTimeError } from "../utils/getTestClockTimeError";

export function TestClockDialog({
	frozenTime,
	setOpen,
}: {
	frozenTime: number;
	setOpen: (open: boolean) => void;
}) {
	const { customer, refetch } = useCusQuery();
	const axios = useAxiosInstance();
	const advanceClock = useMutation({
		mutationFn: (target: number) =>
			axios.post("/v1/billing.advance_test_clock", {
				customer_id: customer.id || customer.internal_id,
				frozen_time: target,
			}),
		onSuccess: () => {
			setOpen(false);
			toast.success("Test clock advance started");
			void refetch();
		},
	});
	const form = useForm({
		defaultValues: { frozenTime: frozenTime as number | null },
		onSubmit: async ({ value }) => {
			if (value.frozenTime == null) return;
			await advanceClock.mutateAsync(value.frozenTime).catch(() => undefined);
		},
	});
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	return (
		<Dialog
			open
			onOpenChange={(open) => !advanceClock.isPending && setOpen(open)}
		>
			<DialogContent className="w-[440px] bg-card">
				<DialogHeader>
					<DialogTitle>Test clock</DialogTitle>
					<DialogDescription>
						Advancing the clock can trigger renewals and invoices for customers
						sharing this clock.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						void form.handleSubmit();
					}}
				>
					<form.Field
						name="frozenTime"
						validators={{
							onChange: ({ value }) =>
								getTestClockTimeError({ frozenTime, target: value }),
							onSubmit: ({ value }) =>
								getTestClockTimeError({ frozenTime, target: value }),
						}}
					>
						{(field) => (
							<fieldset
								className="flex min-w-0 flex-col gap-2"
								disabled={advanceClock.isPending}
							>
								<legend className="mb-2 text-sm font-medium">Advance to</legend>
								<DateInputUnix
									unixDate={field.state.value}
									setUnixDate={field.handleChange}
									minUnixDate={frozenTime}
									fromYear={new Date(frozenTime).getFullYear()}
									disablePastDates
									withTime
								/>
								<p className="text-xs text-muted-foreground">
									Timezone: {timezone}
								</p>
								{field.state.meta.errors.length > 0 && (
									<p role="alert" className="text-sm text-destructive">
										{field.state.meta.errors.join(" ")}
									</p>
								)}
							</fieldset>
						)}
					</form.Field>
					{advanceClock.isError && (
						<p role="alert" className="text-sm text-destructive">
							{getBackendErr(
								advanceClock.error,
								"Failed to advance test clock",
							)}
						</p>
					)}
					<DialogFooter>
						<Button
							type="button"
							variant="secondary"
							onClick={() => setOpen(false)}
							disabled={advanceClock.isPending}
						>
							Cancel
						</Button>
						<form.Subscribe
							selector={(state) =>
								[state.values.frozenTime, state.isSubmitting] as const
							}
						>
							{([target, isSubmitting]) => (
								<Button
									type="submit"
									variant="primary"
									isLoading={isSubmitting}
									disabled={
										getTestClockTimeError({ frozenTime, target }) != null ||
										isSubmitting
									}
								>
									Advance clock
								</Button>
							)}
						</form.Subscribe>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
