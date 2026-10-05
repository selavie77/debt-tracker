import { signOut } from "@/app/login/actions";
import { requireUser } from "@/lib/db";
import { Nav } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">
          Debt Elimination
          <br />
          Tracker
          <small>Phase 1</small>
        </div>
        <Nav />
        <div className="account">
          <span className="note" title={user.email ?? ""}>{user.email}</span>
          <form action={signOut}>
            <button className="theme" type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
