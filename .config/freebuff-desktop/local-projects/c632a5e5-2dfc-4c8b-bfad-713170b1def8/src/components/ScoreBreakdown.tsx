import type { ScoreResult } from "../../shared/types";
import { ScoreRing } from "./ui";

const GROUPS: { id: string; title: string; caption: string; keys: string[] }[] = [
  {
    id: "home",
    title: "Home & logistics",
    caption: "How well the home fits what was asked for",
    keys: ["budget", "area", "spaceType", "bedrooms", "washrooms", "parking", "furnished", "lease"],
  },
  {
    id: "living",
    title: "Living together",
    caption: "Day-to-day habits under the same roof",
    keys: ["tidiness", "kitchen", "smells", "issueSpeed"],
  },
  {
    id: "social",
    title: "Social & lifestyle",
    caption: "Schedule, noise, company and shared interests",
    keys: ["schedule", "chronotype", "social", "music", "hobbies", "pets", "smoking"],
  },
];

function groupScore(score: ScoreResult, keys: string[]): number {
  const criteria = score.criteria.filter((criterion) => keys.includes(criterion.key));
  const weight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (!weight) return 0;
  const earned = criteria.reduce(
    (sum, criterion) => sum + criterion.weight * criterion.score,
    0,
  );
  return Math.round((earned / weight) * 100);
}

export function ScoreBreakdown({
  score,
  excluded,
  readOnly = false,
}: {
  score: ScoreResult;
  excluded?: string[];
  readOnly?: boolean;
}) {
  const homeFit = groupScore(score, GROUPS[0].keys);
  const livingFit = groupScore(score, [...GROUPS[1].keys, ...GROUPS[2].keys]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-[#fffafc] p-3.5">
        <ScoreRing score={score.score} size={64} />
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-2">
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">
              Home fit
            </p>
            <p className="text-[18px] font-extrabold">{homeFit}%</p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">
              Living fit
            </p>
            <p className="text-[18px] font-extrabold">{livingFit}%</p>
          </div>
        </div>
        <p className="w-full text-[11px] leading-relaxed text-muted sm:w-auto sm:max-w-[190px]">
          Combined percent is the weighted score across all 19 published criteria.
        </p>
      </div>

      <div className="mt-4 space-y-4">
        {GROUPS.map((group) => {
          const criteria = [...score.criteria]
            .filter((criterion) => group.keys.includes(criterion.key))
            .sort((a, b) => b.weight - a.weight);
          return (
            <section key={group.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-1">
                <h4 className="text-[12.5px] font-extrabold uppercase tracking-[0.06em] text-crimson">
                  {group.title}
                </h4>
                <span className="text-[11.5px] font-bold text-muted">
                  {groupScore(score, group.keys)}%
                </span>
              </div>
              <p className="text-[11px] text-muted">{group.caption}</p>
              <div className="mt-2 space-y-2">
                {criteria.map((criterion) => (
                  <div key={criterion.key}>
                    <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                      <span className="font-semibold">
                        {criterion.label}{" "}
                        <span className="font-normal text-muted">({criterion.weight} pts)</span>
                      </span>
                      <span
                        className={`font-bold ${
                          criterion.score >= 0.85
                            ? "text-ok"
                            : criterion.score <= 0.45
                              ? "text-crimson"
                              : "text-muted"
                        }`}
                      >
                        {Math.round(criterion.score * 100)}
                        {criterion.score >= 0.95
                          ? " · full"
                          : criterion.score <= 0.45
                            ? " · poor"
                            : " · partial"}
                      </span>
                    </div>
                    <div className="meter mt-1">
                      <span style={{ width: `${Math.round(criterion.score * 100)}%` }} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">{criterion.note}</p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {excluded?.length ? (
        <div className="mt-4 rounded-xl border border-[#f1d58a] bg-[#fff7e6] p-3">
          <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#8a5a00]">
            Kept out of this score
          </p>
          {excluded.map((item) => (
            <p key={item} className="mt-1 text-[12px] leading-relaxed text-[#8a5a00]">
              “{item}” — stored beside the profile, never read by the scorer.
            </p>
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Only questionnaire and home answers are scored. Age, family status, disability, religion,
        race, place of origin, gender and receipt of public assistance have no field in the model.
        Raw diet and work-situation answers are never shown. {readOnly ? "Read-only snapshot." : ""}
      </p>
    </div>
  );
}
