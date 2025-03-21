import { Button } from "@/components/ui/button";
import { useEnv } from "@/utils/envUtils";
import { Link } from "react-router";
import React from "react";
import { getRedirectUrl } from "@/utils/genUtils";

function ErrorScreen({
  children,
  returnUrl,
}: {
  children: React.ReactNode;
  returnUrl?: string;
}) {
  const env = useEnv();
  return (
    <div className="flex h-full w-full items-center justify-center flex-col gap-2">
      <div className="text-t2 text-sm max-w-sm text-center">{children}</div>
      {returnUrl && (
        <Link
          className="text-t3 text-sm hover:underline"
          to={getRedirectUrl(returnUrl, env)}
        >
          Return
        </Link>
      )}
    </div>
  );
}

export default ErrorScreen;
