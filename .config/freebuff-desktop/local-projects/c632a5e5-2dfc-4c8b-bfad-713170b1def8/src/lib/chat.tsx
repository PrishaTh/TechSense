import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ChatListing } from "../../shared/types";
import { bedroomLabel, budgetLabel, label, washroomLabel } from "../../shared/types";
import { api, errorMessage } from "./api";
import { useSession } from "./session";

export type ChatMessage = {
  from: "bot" | "me";
  title?: string;
  text?: string;
  attachment?: string;
};

const generalAnswers: { keys: string[]; title: string; body: string }[] = [
  {
    keys: ["how", "work", "step", "start"],
    title: "Four steps",
    body: "Answer the lifestyle quiz, then swipe through ranked matches with the reasons shown. A mutual like unlocks contact details, the rental application, a viewing and a SingleKey check. The landlord chooses, and Deservia pre-fills an Ontario Standard Lease to sign.",
  },
  {
    keys: ["pricing", "price", "cost", "free", "plan", "pay"],
    title: "Pricing",
    body: "Creating an account, the lifestyle quiz, ranked matches, score breakdowns and your first landlord listing are free for 30 days. Gold ($29.99) and Platinum ($49.99) listing plans are marked coming soon.",
  },
  {
    keys: ["match", "score", "percent", "rank", "weight", "algorithm"],
    title: "How matching works",
    body: "Every tenant is scored against every active listing on 19 published criteria — tidiness, smoking, pets, noise, schedule, hobbies, kitchen habits, budget, area and more. Each score opens up its weights and per-question fit. Deservia suggests; people decide.",
  },
  {
    keys: ["privacy", "data", "protected", "discriminat", "safe", "password"],
    title: "Privacy and fairness",
    body: "Age, family status, disability, religion, race, place of origin, gender and receipt of public assistance have no field in the questionnaire, so they cannot enter a score. Passwords are stored only as salted hashes, and Deservia never holds card numbers, bank details or credit reports.",
  },
  {
    keys: ["screen", "singlekey", "credit", "income", "check"],
    title: "Screening",
    body: "The tenant starts and pays for SingleKey screening after a viewing. SingleKey handles job, income and credit checks; Deservia stores only pass or flagged, never the report.",
  },
  {
    keys: ["lease", "sign", "accept", "ontario"],
    title: "Accepting and signing",
    body: "The landlord makes the final choice after screening passes. That generates an Ontario Standard Lease pre-filled from the listing, and both sides sign digitally. Either side can withdraw before then.",
  },
  {
    keys: ["contact", "email", "phone", "address"],
    title: "Contact details",
    body: "Match cards show first name, address and distance, rent or budget, lifestyle tags and the score. Full name and email unlock only after the landlord accepts the tenant's request. The unit address is confirmed again when a viewing is booked.",
  },
  {
    keys: ["application", "apply", "pdf", "form"],
    title: "Rental application",
    body: "The fillable rental application unlocks on a mutual match. The link appears on the match card and in My matches, and opens a PDF you can type into and save. It disappears if either side unmatches.",
  },
  {
    keys: ["viewing", "tour", "schedule", "calendar"],
    title: "Scheduling a viewing",
    body: "On a mutual match, both sides mark the half-hour slots they are free in the next week. Only overlapping slots can be proposed; the other side confirms or picks another overlap. Times are stored in UTC and shown in your own time zone.",
  },
  {
    keys: ["landlord", "listing", "tenant", "role"],
    title: "Tenants and landlords",
    body: "Everyone uses the same sign-in; the role on the account decides the screens. Tenants swipe listings, landlords swipe tenants for their listing, and admins get oversight instead of a deck.",
  },
];

function generalAnswer(text: string) {
  const lower = text.toLowerCase();
  const hit = generalAnswers.find((entry) => entry.keys.some((key) => lower.includes(key)));
  return (
    hit ?? {
      title: "Ask me about Deservia",
      body: "Try “How does it work?”, “Pricing”, “How does matching work?” or “Privacy”. This assistant answers from a fixed set of explanations inside the app; nothing is sent anywhere.",
    }
  );
}

function notListed(listing: ChatListing, field: string): string {
  return `That isn't listed for this unit — best to ask ${listing.landlordName} directly about the ${field}.`;
}

/** Answers about an attached listing, strictly from its server data. */
function listingAnswer(question: string, listing: ChatListing) {
  const q = question.toLowerCase();
  const has = (words: string[]) => words.some((word) => q.includes(word));
  const rent = `${budgetLabel(listing.rent)}/month`;
  const rooms = `${bedroomLabel(listing.bedrooms)} · ${washroomLabel(listing.washrooms)}`;

  if (has(["why", "match", "score", "good fit", "compatib"])) {
    if (!listing.match) {
      return {
        title: "Match score",
        body: "A score is calculated when this listing is in your deck. Ask me about the rent, policies or amenities and I will answer from the listing data.",
      };
    }
    const top = [...listing.match.criteria]
      .sort((a, b) => b.weight * b.score - a.weight * a.score)
      .slice(0, 3)
      .map((criterion) => `${criterion.label}: ${criterion.note}`);
    return {
      title: `Why it fits — ${listing.match.score}%`,
      body: `${top.join(". ")}. The full breakdown is on the listing card under “Why this score?”.`,
    };
  }

  if (has(["deposit", "last month"])) {
    return {
      title: "Deposit",
      body: listing.deposit ? `${budgetLabel(listing.deposit)} deposit.` : notListed(listing, "deposit"),
    };
  }

  if (has(["rent", "price", "cost", "budget", "monthly", "how much"])) {
    return {
      title: "Rent",
      body: `${rent} for ${rooms} in ${listing.area}. ${
        listing.deposit ? `Deposit ${budgetLabel(listing.deposit)}.` : "The deposit isn't listed."
      } ${listing.utilities.length ? `Included: ${listing.utilities.join(", ")}.` : ""}`,
    };
  }

  if (has(["parking", "garage", "driveway", "car"])) {
    return {
      title: "Parking",
      body:
        listing.parkingDetail ??
        (listing.parking === "none"
          ? "No parking is listed."
          : listing.parking === "street"
            ? "Street parking only."
            : "Parking is included."),
    };
  }

  if (has(["pet", "dog", "cat", "animal"])) {
    return {
      title: "Pets",
      body:
        listing.petsDetail ??
        `Pet policy is recorded as “${label("pets", listing.petsPolicy)}”.`,
    };
  }

  if (has(["smok", "cigarette", "vape", "tobacco"])) {
    return {
      title: "Smoking",
      body:
        listing.smokingDetail ??
        `Smoking policy is recorded as “${label("smoking", listing.smokingPolicy)}”.`,
    };
  }

  if (has(["laundry", "washer", "dryer"])) {
    return {
      title: "Laundry",
      body: listing.laundry ?? notListed(listing, "laundry"),
    };
  }

  if (has(["utilit", "included", "heat", "hydro", "electric", "water", "internet", "wifi", "wi-fi", "cable", "snow"])) {
    if (has(["heat", "air condition", "cooling"])) {
      return {
        title: "Heating and cooling",
        body: `${
          listing.heatingCooling ?? notListed(listing, "heating and cooling")
        }${listing.utilities.length ? ` Included in rent: ${listing.utilities.join(", ")}.` : ""}`,
      };
    }
    return {
      title: "Included in rent",
      body: listing.utilities.length
        ? `${listing.utilities.join(", ")} are included in the rent. Anything else is the tenant's own account.`
        : notListed(listing, "list of included utilities"),
    };
  }

  if (has(["amenit", "feature", "gym", "pool", "dishwasher", "storage", "elevator", "transit", "school", "shopping", "fireplace", "microwave", "fridge", "stove", "ev "])) {
    return {
      title: "Features and amenities",
      body: listing.amenities.length
        ? listing.amenities.join(", ")
        : notListed(listing, "features and amenities"),
    };
  }

  if (has(["bedroom", "bhk", "how many bed", "size", "sq", "square", "space"])) {
    return {
      title: "Size",
      body: `${rooms}. ${
        listing.sizeSqft ? `${listing.sizeSqft} sq ft.` : "The square footage isn't listed."
      }`,
    };
  }

  if (has(["bath", "washroom", "toilet", "shower"])) {
    return {
      title: "Washrooms",
      body: listing.washroomsDetail ?? `${washroomLabel(listing.washrooms)}.`,
    };
  }

  if (has(["available", "move in", "move-in", "date", "when"])) {
    return {
      title: "Availability",
      body: listing.availableFrom
        ? `Available from ${listing.availableFrom}. The listing is marked “${label("timing", listing.available)}”.`
        : `Marked “${label("timing", listing.available)}”; no exact date is listed.`,
    };
  }

  if (has(["lease", "term", "contract", "how long"])) {
    return { title: "Lease", body: `${label("lease", listing.lease)} lease term.` };
  }

  if (has(["furnish", "furniture", "couch", "bed frame"])) {
    return { title: "Furnished", body: `${label("furnished", listing.furnished)}.` };
  }

  if (has(["floor", "level", "basement", "storey", "story"])) {
    return { title: "Floor", body: listing.floorLevel ?? notListed(listing, "floor or level") };
  }

  if (has(["kitchen", "cook", "stove", "oven"])) {
    return { title: "Kitchen", body: listing.kitchen ?? notListed(listing, "kitchen") };
  }

  if (has(["outdoor", "backyard", "balcony", "patio", "garden", "deck"])) {
    return { title: "Outdoor space", body: listing.outdoor ?? notListed(listing, "outdoor space") };
  }

  if (has(["entrance", "door", "private entry"])) {
    return { title: "Entrance", body: listing.entrance ?? notListed(listing, "entrance") };
  }

  if (has(["photo", "picture", "image"])) {
    return {
      title: "Photos",
      body: listing.photos.length
        ? `${listing.photos.length} photo${listing.photos.length === 1 ? "" : "s"} are on the listing.`
        : notListed(listing, "photos"),
    };
  }

  if (has(["address", "where", "location", "neighbourhood", "neighborhood", "area", "far", "downtown", "distance", "commute", "transit"])) {
    return {
      title: "Location",
      body: listing.address
        ? `It is at ${listing.address}${listing.distanceKm !== null && listing.distanceKm !== undefined ? `, about ${listing.distanceKm.toFixed(1)} km from your address` : ""}.`
        : `It is in ${listing.area}. This listing has not added a street address, so I can't calculate the distance.`,
    };
  }

  if (has(["house rule", "rules", "quiet", "guest"])) {
    return {
      title: "House rules",
      body: listing.houseRules.length
        ? listing.houseRules.join(" · ")
        : notListed(listing, "house rules"),
    };
  }

  if (has(["describe", "about", "summary", "tell me"])) {
    return { title: listing.title, body: summaryOf(listing) };
  }

  return {
    title: "Ask about this listing",
    body: `${summaryOf(listing)} Ask me about rent, parking, pets, laundry, utilities, size, availability, the lease or why it matched. If a detail isn't in the listing I will say so.`,
  };
}

function summaryOf(listing: ChatListing): string {
  return `${listing.title} — ${listing.area}. ${bedroomLabel(listing.bedrooms)}, ${washroomLabel(
    listing.washrooms,
  )}, ${budgetLabel(listing.rent)}/mo, ${
    listing.availableFrom ? `available ${listing.availableFrom}` : label("timing", listing.available)
  }. ${listing.description}`.trim();
}

type ChatState = {
  open: boolean;
  setOpen: (next: boolean) => void;
  attachment: ChatListing | null;
  messages: ChatMessage[];
  attachListing: (listingId: string) => Promise<void>;
  removeAttachment: () => void;
  ask: (question: string) => void;
  busy: boolean;
  error: string | null;
};

const greeting: ChatMessage = {
  from: "bot",
  title: "Hi — I'm the Deservia assistant",
  text: "I can explain matching, pricing, privacy, screening or how the app works. Pick a question below, or attach a listing you liked.",
};

type StoredChatMessage = {
  id: string;
  from: "bot" | "me";
  title: string | null;
  text: string | null;
  attachment: string | null;
  listingId: string | null;
  createdAt: string;
};

function view(row: StoredChatMessage): ChatMessage {
  return {
    from: row.from,
    title: row.title ?? undefined,
    text: row.text ?? undefined,
    attachment: row.attachment ?? undefined,
  };
}

const ChatContext = createContext<ChatState | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [attachment, setAttachment] = useState<ChatListing | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveMessage = useCallback(async (message: ChatMessage, listingId: string | null) => {
    try {
      await api("/api/chat", {
        method: "POST",
        body: JSON.stringify({ ...message, listingId }),
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }, []);

  // The conversation lives in the database, so it is the same after a reload.
  useEffect(() => {
    if (!session) {
      setMessages([greeting]);
      setAttachment(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<{ messages: StoredChatMessage[] }>("/api/chat");
        if (cancelled) return;
        const history = data.messages ?? [];
        setMessages([greeting, ...history.map(view)]);
        const last = [...history].reverse().find((entry) => entry.listingId);
        if (!last?.listingId) {
          setAttachment(null);
          return;
        }
        try {
          const listing = await api<ChatListing>(`/api/listings/${last.listingId}/chat`);
          if (!cancelled) setAttachment(listing);
        } catch {
          if (!cancelled) setAttachment(null);
        }
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const attachListing = useCallback(
    async (listingId: string) => {
      setBusy(true);
      setError(null);
      try {
        const listing = await api<ChatListing>(`/api/listings/${listingId}/chat`);
        setAttachment(listing);
        setOpen(true);
        const chip = `${bedroomLabel(listing.bedrooms)}, ${listing.title}, ${budgetLabel(
          listing.rent,
        )}/mo`;
        const mine: ChatMessage = {
          from: "me",
          text: "Attach this listing to the chat.",
          attachment: chip,
        };
        const reply: ChatMessage = {
          from: "bot",
          title: "Listing attached",
          attachment: chip,
          text: `${summaryOf(listing)} Ask me anything about it — rent, parking, pets, laundry, utilities, availability or why it matched.`,
        };
        setMessages((current) => [...current, mine, reply]);
        await saveMessage(mine, listing.id);
        await saveMessage(reply, listing.id);
      } catch (cause) {
        setError(errorMessage(cause));
        setOpen(true);
      } finally {
        setBusy(false);
      }
    },
    [saveMessage],
  );

  const removeAttachment = useCallback(() => {
    setAttachment(null);
  }, []);

  const ask = useCallback(
    (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;
      const answer = attachment ? listingAnswer(trimmed, attachment) : generalAnswer(trimmed);
      const mine: ChatMessage = { from: "me", text: trimmed };
      const reply: ChatMessage = { from: "bot", title: answer.title, text: answer.body };
      setMessages((current) => [...current, mine, reply]);
      const listingId = attachment?.id ?? null;
      void (async () => {
        await saveMessage(mine, listingId);
        await saveMessage(reply, listingId);
      })();
    },
    [attachment, saveMessage],
  );

  const value = useMemo(
    () => ({
      open,
      setOpen,
      attachment,
      messages,
      attachListing,
      removeAttachment,
      ask,
      busy,
      error,
    }),
    [open, attachment, messages, attachListing, removeAttachment, ask, busy, error],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatState {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used inside ChatProvider");
  return context;
}
