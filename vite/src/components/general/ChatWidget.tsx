"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";

declare global {
  interface Window {
    patch?: {
      config: {
        organizationId: string;
        email?: string | null;
        name?: string | null;
        avatar_url?: string | null;
      };
    };
  }
}

let widgetInitialized = false;

export function ChatWidget() {
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending || widgetInitialized) return;

    widgetInitialized = true;

    // Set config
    window.patch = {
      config: {
        organizationId: import.meta.env.VITE_PATCH_ORG_ID,
        email: session?.user?.email,
        name: session?.user?.name,
        avatar_url: session?.user?.image,
      },
    };

    // Load script
    const script = document.createElement("script");
    script.src = "https://chat.patch.bot/widget/loader.js";
    script.async = true;
    document.head.appendChild(script);

    return;
  }, [session, isPending]);

  return null;
}
