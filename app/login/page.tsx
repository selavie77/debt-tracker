import Link from "next/link";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="login">
      <div className="panel login-card">
        <Link href="/" className="brand" style={{ color: "inherit", textDecoration: "none" }}>
          Debt Elimination
          <br />
          Tracker
        </Link>
        <p className="sub">Sign in to your account, or create one. Your debts are visible only to you.</p>
        {error === "link" && (
          <div className="msg err" role="alert">
            That sign-in link did not work. Links can be used once and expire quickly, and the default kind only works in the browser that asked for it. Request a new one below.
          </div>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
