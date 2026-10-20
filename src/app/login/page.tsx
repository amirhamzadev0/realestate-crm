import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/forms/LoginForm";
import { authEnabled } from "@/config/auth";
import { Card } from "@/components/ui/Card";
import { authService } from "@/server/container";
import { getCurrentUser } from "@/server/auth/session";
import { getHomeViewModel } from "@/viewmodels/home.viewmodel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (!authEnabled) redirect("/");
  const user = await getCurrentUser();
  if (user) redirect(await authService.homeFor(user));
  const site = await getHomeViewModel();

  return (
    <main className="landing">
      <header className="landing__header">
        <h1>{site.name}</h1>
        <p>{site.tagline}</p>
      </header>
      <Card title="Sign in">
        <LoginForm />
      </Card>
    </main>
  );
}
