import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { AutumnProvider } from "autumn-js/react";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      {process.env.NODE_ENV === "development2" ? (
        <App />
      ) : (
        <PostHogProvider
          apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
          options={{
            autocapture: false,
            // capture_pageview: false,
            // capture_pageleave: false,
            // session_recording: {}
            api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
          }}
        >
          <App />
        </PostHogProvider>
      )}
    </ClerkProvider>
  </StrictMode>,
);
