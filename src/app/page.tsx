import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { authEnabled } from "@/config/auth";
import { getCurrentUser } from "@/server/auth/session";
import { authService } from "@/server/container";
import { getHomeViewModel } from "@/viewmodels/home.viewmodel";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // With sign-in on there is no public home: go to your portal, or to the login.
  if (authEnabled) {
    const user = await getCurrentUser();
    redirect(user ? await authService.homeFor(user) : "/login");
  }

  const site = await getHomeViewModel();
  return (
    <main className="landing">
      <header className="landing__header">
        <h1>{site.name}</h1>
        <p>{site.tagline}</p>
      </header>
      <div className="grid grid--2 landing__portals">
        {site.portals.map((portal) => (
          <Link key={portal.role} href={portal.href} className="portal-card">
            <span className="portal-card__icon">
              <Icon name={portal.icon} size={26} />
            </span>
            <h2>{portal.title}</h2>
            <p>{portal.description}</p>
          </Link>
        ))}
      </div>
      <p className="landing__note">Testing mode: sign-in is switched off.</p>
    </main>
  );
}
