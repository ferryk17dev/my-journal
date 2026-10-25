import { redirect } from "next/navigation";
import { isJournalOwner } from "@/lib/supabase/authorization";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    if (await isJournalOwner()) {
      redirect("/admin");
    }
    redirect("/");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <a className="brand" href="/">
          Fieldnotes
        </a>
        <p className="eyebrow">Owner access</p>
        <h1 id="login-title">Welcome back.</h1>
        <p className="auth-description">
          Sign in to continue to your private journal workspace.
        </p>
        <LoginForm />
        <a className="auth-back-link" href="/">
          Return to the journal
        </a>
      </section>
    </main>
  );
}
