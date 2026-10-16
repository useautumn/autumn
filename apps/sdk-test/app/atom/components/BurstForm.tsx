import { Button, Switch } from "@autumn/ui";
import { useForm } from "@tanstack/react-form";
import { numberOrUndefined } from "../format";
import type { AtomRunner } from "../hooks/useAtomRunner";
import { useBurst } from "../hooks/useBurst";
import { BurstStats } from "./BurstStats";
import { FormRow } from "./FormRow";
import { NumberField } from "./NumberField";
import { SubmitButton } from "./SubmitButton";

export const BurstForm = ({ runner }: { runner: AtomRunner }) => {
  const { burst, start, stop } = useBurst({ runner });
  const form = useForm({
    defaultValues: { count: "100", amount: "1", sendEvent: true },
    onSubmit: ({ value }) =>
      start({
        count: numberOrUndefined(value.count) ?? 0,
        amount: numberOrUndefined(value.amount),
        sendEvent: value.sendEvent,
      }),
  });

  return (
    <div className="flex flex-col gap-3">
      <FormRow onSubmit={form.handleSubmit}>
        <form.Field name="count">
          {(field) => (
            <NumberField label="Calls" value={field.state.value} onChange={field.handleChange} />
          )}
        </form.Field>
        <form.Field name="amount">
          {(field) => (
            <NumberField label="Amount" value={field.state.value} onChange={field.handleChange} />
          )}
        </form.Field>
        <form.Field name="sendEvent">
          {(field) => (
            <label className="flex h-input cursor-pointer items-center gap-2 text-xs text-tertiary-foreground">
              <Switch checked={field.state.value} onCheckedChange={field.handleChange} />
              Send event
            </label>
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) =>
            isSubmitting ? (
              <Button variant="secondary" className="ml-auto min-w-24" onClick={stop}>
                Stop
              </Button>
            ) : (
              <SubmitButton isSubmitting={false}>Run</SubmitButton>
            )
          }
        </form.Subscribe>
      </FormRow>
      {burst && <BurstStats burst={burst} />}
    </div>
  );
};
