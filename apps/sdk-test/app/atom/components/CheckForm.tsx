import { useForm } from "@tanstack/react-form";
import { numberOrUndefined } from "../format";
import type { AtomRunner } from "../hooks/useAtomRunner";
import { FormRow } from "./FormRow";
import { NumberField } from "./NumberField";
import { SubmitButton } from "./SubmitButton";

export const CheckForm = ({ runner, sendEvent }: { runner: AtomRunner; sendEvent: boolean }) => {
  const form = useForm({
    defaultValues: { amount: "1" },
    onSubmit: async ({ value }) => {
      await runner.run({
        label: `${sendEvent ? "Send event" : "Check"} ${value.amount}`,
        call: {
          action: "check",
          params: { ...runner.base, requiredBalance: numberOrUndefined(value.amount), sendEvent },
        },
      });
    },
  });

  return (
    <FormRow onSubmit={form.handleSubmit}>
      <form.Field name="amount">
        {(field) => (
          <NumberField label="Amount" value={field.state.value} onChange={field.handleChange} />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <SubmitButton isSubmitting={isSubmitting}>{sendEvent ? "Send" : "Check"}</SubmitButton>
        )}
      </form.Subscribe>
    </FormRow>
  );
};
