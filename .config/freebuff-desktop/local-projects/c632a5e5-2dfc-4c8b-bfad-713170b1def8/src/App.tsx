import type { ReactNode } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Assistant } from "./components/Assistant";
import { Chatbot } from "./components/Chatbot";
import { AppNav } from "./components/Nav";
import { Spinner } from "./components/ui";
import { homeForRole, useSession } from "./lib/session";
import { ChatProvider } from "./lib/chat";
import type { Role } from "../shared/types";
import SignIn from "./pages/SignIn";
import Deck from "./pages/Deck";
import Matches from "./pages/Matches";
import ProfilePage from "./pages/ProfilePage";
import Questionnaire from "./pages/Questionnaire";
import ListingEditor from "./pages/ListingEditor";
import MyListings from "./pages/MyListings";
import Compare from "./pages/Compare";
import LikedListings from "./pages/LikedListings";
import Requests from "./pages/Requests";
import Admin from "./pages/Admin";

function AppLayout() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Opening Deservia…" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;

  return (
    <ChatProvider>
      <div className="flex min-h-screen flex-col">
        <AppNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-5 sm:py-8">
          <Outlet />
        </main>
        <footer className="border-t border-line/70 px-4 py-5 text-center text-[12px] text-muted">
          Deservia Realty Inc. · Brampton ·{" "}
          <span className="font-semibold">we match on how you live, never on who you are</span>
        </footer>
        <Assistant />
        <Chatbot />
      </div>
    </ChatProvider>
  );
}

function RoleRoute({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { session, loading } = useSession();
  if (loading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Spinner label="Checking your account…" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  if (!allow.includes(session.profile.role)) {
    return <Navigate to={homeForRole(session.profile.role)} replace />;
  }
  return <>{children}</>;
}

function AppIndex() {
  const { session } = useSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.profile.role === "landlord" && !session.listing) {
    return <Navigate to="/app/listing/new" replace />;
  }
  return <Navigate to={homeForRole(session.profile.role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<SignIn mode="login" />} />
      <Route path="/login" element={<SignIn mode="login" />} />
      <Route path="/signup" element={<SignIn mode="signup" />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<AppIndex />} />
        <Route
          path="deck"
          element={
            <RoleRoute allow={["tenant", "landlord"]}>
              <Deck />
            </RoleRoute>
          }
        />
        <Route path="discover" element={<Navigate to="/app/deck" replace />} />
        <Route
          path="requests"
          element={
            <RoleRoute allow={["landlord"]}>
              <Requests />
            </RoleRoute>
          }
        />
        <Route
          path="matches"
          element={
            <RoleRoute allow={["tenant", "landlord"]}>
              <Matches />
            </RoleRoute>
          }
        />
        <Route
          path="listings"
          element={
            <RoleRoute allow={["landlord"]}>
              <MyListings />
            </RoleRoute>
          }
        />
        <Route
          path="listing"
          element={
            <RoleRoute allow={["landlord"]}>
              <Navigate to="/app/listings" replace />
            </RoleRoute>
          }
        />
        <Route
          path="listing/new"
          element={
            <RoleRoute allow={["landlord"]}>
              <ListingEditor />
            </RoleRoute>
          }
        />
        <Route
          path="listing/:id"
          element={
            <RoleRoute allow={["landlord"]}>
              <ListingEditor />
            </RoleRoute>
          }
        />
        <Route
          path="liked"
          element={
            <RoleRoute allow={["tenant"]}>
              <LikedListings />
            </RoleRoute>
          }
        />
        <Route
          path="compare"
          element={
            <RoleRoute allow={["tenant", "landlord"]}>
              <Compare />
            </RoleRoute>
          }
        />
        <Route
          path="questionnaire"
          element={
            <RoleRoute allow={["tenant", "landlord"]}>
              <Questionnaire />
            </RoleRoute>
          }
        />
        <Route path="profile" element={<RoleRoute allow={["tenant", "landlord", "admin"]}><ProfilePage /></RoleRoute>} />
        <Route
          path="admin"
          element={
            <RoleRoute allow={["admin"]}>
              <Admin />
            </RoleRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
