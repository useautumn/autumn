import { Button } from "@autumn/ui";
import type { ReactNode } from "react";

export const SubmitButton = ({
  isSubmitting,
  children,
}: {
  isSubmitting: boolean;
  children: ReactNode;
}) => (
  <Button type="submit" isLoading={isSubmitting} className="ml-auto min-w-24">
    {children}
  </Button>
);
