import { Link, NavLink, useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import { Avatar } from "./ui";
import { Notifications } from "./Notifications";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2 text-lg font-extrabold tracking-[0.14em]">
      <span className="h-2.5 w-2.5 rounded-full bg-pink2" />
      <span className={light ? "text-white" : "text-navy"}>DESERVIA</span>
    </Link>
  );
}

export function PublicNav() {
  const { session } = useSession();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy/95 text-white backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3.5">
        <Logo light />
        <nav className="hidden items-center gap-6 text-[13.5px] text-white/80 md:flex">
          <a href="#how" className="hover:text-white">
            How it works
          </a>
          <a href="#why" className="hover:text-white">
            Why Deservia
          </a>
          <a href="#fairness" className="hover:text-white">
            Fair matching
          </a>
          <a href="#plans" className="hover:text-white">
            Plans
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {session ? (
            <Link to="/app" className="btn btn-light btn-sm">
              Open the app
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="hidden rounded-full px-3 py-2 text-[13px] font-semibold text-white/80 hover:text-white sm:inline-flex"
              >
                Log in
              </Link>
              <Link to="/signup" className="btn btn-light btn-sm">
                Get started free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const tenantLinks = [
  { to: "/app/deck", label: "Your matches" },
  { to: "/app/liked", label: "Liked listings" },
  { to: "/app/compare", label: "Compare" },
  { to: "/app/matches", label: "My matches" },
  { to: "/app/profile", label: "My account" },
];

const landlordLinks = [
  { to: "/app/requests", label: "Requests", badge: true },
  { to: "/app/matches", label: "My matches" },
  { to: "/app/listings", label: "My listings" },
  { to: "/app/profile", label: "My account" },
];

const adminLinks = [
  { to: "/app/admin", label: "Oversight" },
  { to: "/app/profile", label: "My account" },
];

export function AppNav() {
  const { session, signOut } = useSession();
  const navigate = useNavigate();
  const profile = session?.profile;
  const links =
    profile?.role === "admin" ? adminLinks : profile?.role === "landlord" ? landlordLinks : tenantLinks;
  const pendingRequests = session?.stats.requests ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
        <Logo light />

        <nav className="order-3 flex w-full items-center gap-1 overflow-x-auto md:order-none md:w-auto md:gap-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-full px-3.5 py-1.5 text-[13.5px] font-semibold transition ${
                  isActive ? "bg-white/15 text-white" : "text-white/70 hover:text-white"
                }`
              }
            >
              {link.label}
              {"badge" in link && link.badge && pendingRequests > 0 ? (
                <span className="ml-1.5 inline-grid h-[18px] min-w-[18px] place-items-center rounded-full bg-pink2 px-1 text-[10.5px] font-extrabold text-white">
                  {pendingRequests}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {profile ? (
            <>
              <Notifications />
              <div className="hidden items-center gap-2 sm:flex">
                <Avatar emoji={profile.avatar} accent={profile.accent} size={34} />
                <div className="leading-tight">
                  <div className="max-w-[150px] truncate text-[13px] font-bold">{profile.name}</div>
                  <div className="text-[11px] uppercase tracking-wide text-white/55">
                    {profile.role === "admin" ? "Deservia admin" : profile.role}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  void signOut().then(() => navigate("/"));
                }}
                className="rounded-full border border-white/25 px-3 py-1.5 text-[12.5px] font-semibold text-white/80 hover:border-white/50 hover:text-white"
              >
                Log out
              </button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
