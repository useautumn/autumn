import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "react-router";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGoogle } from "@fortawesome/free-brands-svg-icons";
import { signIn } from "@/lib/auth-client";

export const SignIn = () => {
  const [email, setEmail] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleEmailSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle email sign in logic here

    console.log("Email sign in:", email);
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signIn.social({
        provider: "google",
        callbackURL: "http://localhost:3000/customers",
      });
    } catch (error) {
      console.error("Error signing in with Google:", error);
    } finally {
      setTimeout(() => {
        setGoogleLoading(false);
      }, 1000);
    }
  };

  return (
    <div className="w-screen h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Logo */}
        <div className="flex justify-center">
          <img src="/logo_hd.png" alt="Autumn" className="w-12 h-12" />
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-lg font-semibold text-foreground">
            Sign in to Autumn
          </h1>
        </div>

        {/* Sign In Form */}
        <div className="space-y-6">
          {/* Google Sign In Button */}
          <Button
            variant="outline"
            onClick={handleGoogleSignIn}
            className="w-full h-10 font-medium text-sm gap-2"
            // disabled={googleLoading}
            isLoading={googleLoading}
            startIcon={
              <FontAwesomeIcon icon={faGoogle} className="text-zinc-400" />
            }
          >
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or
              </span>
            </div>
          </div>

          <form onSubmit={handleEmailSignIn} className="space-y-4">
            {/* Email Input */}
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 text-base"
              />
            </div>

            {/* Sign In Button */}
            <Button
              type="submit"
              className="w-full h-10 bg-primary hover:bg-primary/90 font-medium text-md"
            >
              Sign in
            </Button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center space-y-2">
          <Link to="/sign-up" className="hover:underline text-t3 text-sm">
            Create an account here
          </Link>
        </div>
      </div>
    </div>
  );
};
