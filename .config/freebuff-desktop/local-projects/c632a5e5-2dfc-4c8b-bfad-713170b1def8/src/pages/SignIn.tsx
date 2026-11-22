import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Spinner } from "../components/ui";
import { errorMessage } from "../lib/api";
import { homeForRole, useSession } from "../lib/session";

const roles = [
  {
    id: "tenant" as const,
    title: "I'm a Tenant",
    body: "Answer the quiz and match with listings.",
  },
  {
    id: "landlord" as const,
    title: "I'm a Landlord",
    body: "Add your place and match with tenants.",
  },
];

export default function SignIn({ mode: initialMode }: { mode: "login" | "signup" }) {
  const { session, signIn, signUp, signOut } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [phase, setPhase] = useState<"details" | "role">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [age18, setAge18] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPolicy, setShowPolicy] = useState(false);

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setPhase("details");
    setError(null);
    navigate(next === "login" ? "/login" : "/signup", { replace: true });
  }

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await signIn(email, password);
      navigate(
        next.profile.role === "landlord" && !next.listing
          ? "/app/listing/new"
          : homeForRole(next.profile.role),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function submitDetails(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError("Enter your full name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      return setError("Enter a valid email address.");
    }
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    if (!age18) return setError("Confirm that you are 18 or older.");
    if (!policy) return setError("Accept the privacy policy to continue.");
    setPhase("role");
  }

  async function chooseRole(role: "tenant" | "landlord") {
    setBusy(true);
    setError(null);
    try {
      const next = await signUp({
        name,
        email,
        password,
        role,
        age18,
        policy,
      });
      navigate(
        next.profile.role === "admin"
          ? "/app/admin"
          : next.profile.role === "landlord"
            ? "/app/listing/new"
            : "/app/questionnaire",
      );
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-page">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <div className="mb-5 text-center">
          <span className="inline-flex items-center gap-2 text-lg font-extrabold tracking-[0.14em]">
            <span className="h-2.5 w-2.5 rounded-full bg-pink2" />
            <span className="text-navy">DESERVIA</span>
          </span>
        </div>

        <div className="card p-5 sm:p-6">
          <div className="flex rounded-full bg-[#f8edf3] p-1">
            <button
              type="button"
              className={`flex-1 rounded-full px-3 py-2 text-[13px] font-bold transition ${
                mode === "login" ? "bg-white text-crimson shadow-sm" : "text-muted"
              }`}
              onClick={() => switchMode("login")}
            >
              Log in
            </button>
            <button
              type="button"
              className={`flex-1 rounded-full px-3 py-2 text-[13px] font-bold transition ${
                mode === "signup" ? "bg-white text-crimson shadow-sm" : "text-muted"
              }`}
              onClick={() => switchMode("signup")}
            >
              Create account
            </button>
          </div>

          {session ? (
            <div className="mt-4 rounded-2xl border border-[#bfe6d4] bg-[#f2fbf7] px-4 py-3 text-[13px] text-[#166534]">
              <p>
                Signed in as <strong>{session.profile.name}</strong>.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link to={homeForRole(session.profile.role)} className="btn btn-primary btn-sm">
                  Open my screen
                </Link>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
                  Log out
                </button>
              </div>
            </div>
          ) : null}

          {mode === "login" ? (
            <form className="mt-5 space-y-3.5" onSubmit={(event) => void submitLogin(event)}>
              <h2 className="text-[17px] font-extrabold">Log in</h2>
              <div>
                <label className="field-label" htmlFor="login-email">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="login-password">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  className="input"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
                />
              </div>
              {error ? (
                <p className="rounded-xl bg-blush px-3 py-2 text-[12.5px] font-semibold text-crimson">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="btn btn-primary w-full" disabled={busy}>
                {busy ? "Logging in…" : "Log in"}
              </button>
            </form>
          ) : phase === "details" ? (
            <form className="mt-5 space-y-3" onSubmit={submitDetails}>
              <h2 className="text-[17px] font-extrabold">Create an account</h2>
              <div>
                <label className="field-label" htmlFor="signup-name">
                  Full name
                </label>
                <input
                  id="signup-name"
                  className="input"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="First and last name"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="signup-email">
                  Email
                </label>
                <input
                  id="signup-email"
                  type="email"
                  className="input"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="signup-password">
                  Password
                </label>
                <input
                  id="signup-password"
                  type="password"
                  className="input"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>

              <label className="flex items-start gap-2.5 rounded-xl border border-line bg-[#fffafc] p-3 text-[12.5px] leading-relaxed">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#a4123f]"
                  checked={age18}
                  onChange={(event) => setAge18(event.target.checked)}
                />
                <span>I confirm that I am 18 years of age or older.</span>
              </label>
              <label className="flex items-start gap-2.5 rounded-xl border border-line bg-[#fffafc] p-3 text-[12.5px] leading-relaxed">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#a4123f]"
                  checked={policy}
                  onChange={(event) => setPolicy(event.target.checked)}
                />
                <span>
                  I accept the{" "}
                  <button
                    type="button"
                    className="font-bold text-crimson underline decoration-crimson/30 underline-offset-2"
                    onClick={() => setShowPolicy(true)}
                  >
                    privacy policy
                  </button>{" "}
                  and how Deservia handles my data.
                </span>
              </label>

              {error ? (
                <p className="rounded-xl bg-blush px-3 py-2 text-[12.5px] font-semibold text-crimson">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="btn btn-primary w-full">
                Continue →
              </button>
              <p className="text-center text-[11.5px] text-muted">
                Already have an account?{" "}
                <button
                  type="button"
                  className="font-bold text-crimson"
                  onClick={() => switchMode("login")}
                >
                  Log in
                </button>
              </p>
            </form>
          ) : (
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-extrabold">Who are you?</h2>
                <button
                  type="button"
                  className="text-[12px] font-bold text-muted hover:text-crimson"
                  onClick={() => setPhase("details")}
                >
                  ← Back
                </button>
              </div>
              <div className="mt-3 space-y-2.5">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void chooseRole(role.id)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-line bg-white p-3.5 text-left transition hover:border-pink/50 hover:shadow-card disabled:opacity-60"
                  >
                    <span>
                      <span className="block text-[14px] font-extrabold">{role.title}</span>
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">
                        {role.body}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {error ? (
                <p className="mt-3 rounded-xl bg-blush px-3 py-2 text-[12.5px] font-semibold text-crimson">
                  {error}
                </p>
              ) : null}
              {busy ? (
                <div className="mt-3">
                  <Spinner label="Creating your account…" />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </main>

      {showPolicy ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy/50 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-lift">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[19px] font-extrabold">Privacy policy</h2>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-full bg-[#f6edf2] text-muted hover:text-crimson"
                onClick={() => setShowPolicy(false)}
                aria-label="Close privacy policy"
              >
                ✕
              </button>
            </div>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
              <li>• Adults only. Every account confirms 18+ before it is created.</li>
              <li>
                • Deservia collects the lifestyle quiz, home preferences, listing facts and account
                email. Protected grounds have no field at all.
              </li>
              <li>
                • Contact details unlock only after a mutual match. The unit address appears when a
                viewing is booked.
              </li>
              <li>
                • Passwords are stored as salted PBKDF2 hashes. Card details, bank details and
                credit reports never reach Deservia; SingleKey returns pass or flagged only.
              </li>
              <li>
                • Profiles are archived or anonymized after a signed lease or 90 days without
                activity. You can download or delete your data from My account at any time.
              </li>
              <li>• Every admin view of a profile is written to an audit log.</li>
            </ul>
            <button
              type="button"
              className="btn btn-primary mt-4 w-full"
              onClick={() => {
                setPolicy(true);
                setShowPolicy(false);
              }}
            >
              Accept and close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
