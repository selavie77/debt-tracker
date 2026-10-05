import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="login">
      <div className="panel login-card">
        <div className="brand">
          Debt Elimination
          <br />
          Tracker
        </div>
        <p className="sub">Sign in to your account, or create one. Your debts are visible only to you.</p>
        <LoginForm />
      </div>
    </div>
  );
}
