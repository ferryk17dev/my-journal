import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { requireJournalOwner } from "@/lib/supabase/authorization";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireJournalOwner();

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Link className="brand" href="/admin">
          Fieldnotes
        </Link>
        <nav aria-label="Admin navigation">
          <Link href="/admin">Dashboard</Link>
          <Link href="/admin/events">Events</Link>
          <Link href="/admin/posts">Posts</Link>
          <form action={logout}>
            <button className="logout-button" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      {children}
    </div>
  );
}
