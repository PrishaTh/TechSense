import { Navigate } from "react-router-dom";
import DeckTenant from "./DeckTenant";
import { useSession } from "../lib/session";

/**
 * Only tenants swipe. A landlord's side of the product is the Requests page:
 * requests arrive from tenants and the landlord accepts or declines them.
 */
export default function Deck() {
  const { session } = useSession();
  if (session?.profile.role === "landlord") return <Navigate to="/app/requests" replace />;
  if (session?.profile.role === "admin") return <Navigate to="/app/admin" replace />;
  return <DeckTenant />;
}
