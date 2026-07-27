"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, PasswordField } from "@/components/ui/field";
import { AlertTriangleIcon } from "@/components/ui/icons";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.get("username"),
        password: form.get("password"),
      }),
    });

    if (!response.ok) {
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      setError(result.error?.message ?? "Sign-in failed. Please try again.");
      setIsSubmitting(false);
      return;
    }

    router.replace("/library");
    router.refresh();
  }

  return (
    <form className="auth__form" noValidate onSubmit={submit}>
      <Field
        autoCapitalize="none"
        autoComplete="username"
        autoCorrect="off"
        autoFocus
        id="username"
        label="Username"
        name="username"
        placeholder="your.username"
        required
      />
      <PasswordField
        autoComplete="current-password"
        id="password"
        label="Password"
        name="password"
        placeholder="••••••••••••"
        required
      />

      {error ? (
        <p className="field__error" role="alert">
          <AlertTriangleIcon size={15} />
          {error}
        </p>
      ) : null}

      <Button block disabled={isSubmitting} size="lg" type="submit" variant="primary">
        {isSubmitting ? (
          <>
            <span className="spinner" />
            Signing in…
          </>
        ) : (
          "Continue"
        )}
      </Button>
    </form>
  );
}
