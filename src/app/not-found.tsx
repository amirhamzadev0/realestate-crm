import Link from "next/link";

export default function NotFound() {
  return (
    <main className="landing">
      <header className="landing__header">
        <h1>Page not found</h1>
        <p>That page or project does not exist.</p>
      </header>
      <Link href="/" className="button">
        Back to portals
      </Link>
    </main>
  );
}
