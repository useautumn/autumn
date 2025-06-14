import "./index.css";
import App from "./App";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { PostHogProvider } from "posthog-js/react";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!PUBLISHABLE_KEY) {
  throw new Error("Add your Clerk Publishable Key to the .env file");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      {process.env.NODE_ENV === "development" ? (
        <App />
      ) : (
        <PostHogProvider
          apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
          options={{
            // autocapture: false,
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
