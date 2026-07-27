import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { getCookieSessionAuth } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  if (await getCookieSessionAuth()) {
    redirect("/library");
  }

  return (
    <AuthShell
      description="Open your library to watch, rename and share recordings — and see who watched them."
      eyebrow="Team access"
      footer="No account yet? Ask a workspace admin to send you an invitation from the Members page."
      title="Sign in to Screenly"
    >
      <LoginForm />
    </AuthShell>
  );
}
