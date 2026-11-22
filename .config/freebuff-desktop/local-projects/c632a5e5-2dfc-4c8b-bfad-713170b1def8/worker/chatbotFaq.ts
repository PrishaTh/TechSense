/**
 * The platform guide the assistant can quote. Kept as plain text so it can be
 * returned verbatim by the `get_platform_faq` tool. It describes features that
 * exist in this codebase today — nothing aspirational.
 */

export const CHATBOT_FAQ = `Deservia — how the platform works

1. Accounts and roles
- Signing up asks for a name, email, password, and whether you are a tenant or a landlord.
  Passwords are stored only as PBKDF2 hashes; sessions are cookies that last 7 days.
- Admin accounts exist to review reports and fairness; they do not browse listings.

2. The lifestyle quiz
- Every account (tenant or landlord) fills in /app/questionnaire: schedule, chronotype,
  social style, tidiness, noise, pets, smoking, cooking, upkeep speed, work, diet, travel,
  driving, and for tenants a "home" section (space type, timing, budget, parking, furnished,
  lease, area, postal code).
- The quiz saves through PUT /api/me. Tenants can add an address which is geocoded so
  distance can be scored.
- The quiz is optional to browse, but match scores are only as good as the answers.

3. Swiping and matching
- The tenant deck (/app/deck) shows one listing at a time with a match percentage and the
  reasons behind it, broken into weighted criteria (rent/budget, area, distance, space type,
  bedrooms, washrooms, parking, furnished, lease, and lifestyle similarities).
- "Like" records interest; "pass" hides the listing for that tenant. Interest is stored per
  tenant-landlord pair, so a tenant can be interested in a landlord only once.
- The landlord then sees the tenant in Requests (/app/requests) and can accept or decline.
  A request is "mutual" when both sides are positive, and "accepted" once the landlord
  accepts. Declining closes the request.

4. Liked listings
- /app/liked lists every listing the tenant liked, with the score, area, rent, and whether
  the landlord has responded. It is tenant-only.

5. Matches and viewing calendar
- /app/matches groups matches into mutual, incoming, outgoing and closed.
- On a match, the landlord opens the calendar and adds 30-minute viewing ranges, which are
  offered only between 12:00 PM and 6:00 PM local time. The tenant picks one of those open
  ranges to request a viewing; the other side confirms it. A confirmed viewing can be marked
  completed or cancelled, and a confirmed viewing can be downloaded as an .ics file.
- Times are stored in UTC and displayed in the browser's local time zone.

6. Rental application PDF
- A rental application form PDF ships with the app and is served from the API so a tenant
  can download and fill it in. It is a static template, not generated per applicant.

7. Compare tab
- /app/compare puts up to four liked listings side by side: rent, area, bedrooms, washrooms,
  availability, parking, furnished, lease and the match score, so tenants can weigh options.

8. Creating and managing listings
- A landlord creates a listing at /app/listing/new and edits it at /app/listing/:id: title,
  blurb, rent, deposit, area, space type, bedrooms, washrooms, parking, furnished, lease,
  availability, pets, smoking, utilities, laundry, entrance, kitchen, outdoor space, size,
  floor, photos, and the exact address (geocoded on save).
- A listing can be paused (temporarily hidden) or marked leased. Landlords with more than one
  listing switch between them on the Requests page.

9. Privacy and safety
- Full contact details are shared once a match is mutual, not before.
- Reports can be filed from a profile or listing; admins review them in /app/admin.
- Accounts can be suspended by an admin; suspended accounts cannot sign in.

10. Limits of this assistant
- This assistant can read the signed-in tenant's liked listings and one listing's saved
  details, or the signed-in landlord's own listings, and can explain the features above.
- It cannot create, edit, delete or accept anything, cannot send messages to another person,
  and cannot see other tenants' or other landlords' data.`;
