import { memo, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AiProgress } from "@/components/ui/AiProgress";
import type { ResumeDoc } from "@/services/resumeService";
import type { Session } from "@/services/tailoringService";
import { agentEdits, removedSkills, SHOWN_EDITS, type AgentEdit } from "./agentEdits";

const AGENTS = {
  reader: { name: "Reader", color: "#10b981" },
  matcher: { name: "Matcher", color: "#8b5cf6" },
  writer: { name: "Writer", color: "#f97316" },
  checker: { name: "Fact Checker", color: "#38bdf8" },
};
type Agent = keyof typeof AGENTS;

const STEPS = [
  "Adding the skills you confirmed",
  "Keeping only what the job needs",
  "Rewriting the headline, summary and bullets",
  "Checking every fact against the resume",
];
// When the wait moves on to Writer, then to Fact Checker. Typical, not measured: the request
// doesn't report progress, so this follows its real order and the last step waits for the end.
const WRITING_AT_MS = 9_000;
const CHECKING_AT_MS = 24_000;
const VIEW_OFFSET = 130;

function calm(): boolean {
  return !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The resume as a page. It never re-renders: the stage marks its lines up directly. */
const Page = memo(function Page({ doc }: { doc: ResumeDoc }) {
  const c = doc.contact;
  const contact = [c.email, c.phone, c.location].filter(Boolean).join(" · ");
  return (
    <>
      <div data-k="name" className="agent-line text-xl font-semibold text-[#04342c]">{c.full_name || "Your resume"}</div>
      <div data-k="headline" className="agent-line min-h-5 text-sm text-[#0f6e56]">{c.headline}</div>
      <div data-k="contact" className="agent-line mb-3 text-xs text-[#57534e]">{contact}</div>
      {doc.summary ? (
        <section data-k="summary-block" className="agent-line">
          <h3 className="agent-heading">Summary</h3>
          <p data-k="summary" className="agent-text">{doc.summary}</p>
        </section>
      ) : null}
      {doc.skills.length ? (
        <section data-k="skills" className="agent-line">
          <h3 className="agent-heading">Skills</h3>
          <div className="flex flex-wrap gap-1">
            {doc.skills.map((s) => (
              <span key={s.id} data-skill={s.name} className="agent-chip">{s.name}</span>
            ))}
          </div>
        </section>
      ) : null}
      {doc.experience.length ? (
        <section data-k="experience" className="agent-line">
          <h3 className="agent-heading">Experience</h3>
          {doc.experience.map((e) => (
            <div key={e.id}>
              <p className="mt-2 text-xs font-semibold text-[#292524]">{[e.title, e.company].filter(Boolean).join(", ")}</p>
              {e.bullets.map((b, i) => (
                <p key={i} data-bullet className="agent-bullet"><span>{b}</span></p>
              ))}
            </div>
          ))}
        </section>
      ) : null}
      {doc.projects.length ? (
        <section data-k="projects" className="agent-line">
          <h3 className="agent-heading">Projects</h3>
          {doc.projects.map((p) => (
            <div key={p.id}>
              <p className="mt-2 text-xs font-semibold text-[#292524]">{p.name}</p>
              {p.bullets.map((b, i) => (
                <p key={i} data-bullet className="agent-bullet"><span>{b}</span></p>
              ))}
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
});

/**
 * The wait while a resume is tailored: named agents work over the person's real resume, in the
 * request's real order. New wording exists only once the request ends, so it is written in then
 * from the finished session. With reduced motion it is the plain progress panel.
 */
export function AgentStage({ before, session, onFinish }: { before: ResumeDoc; session: Session | null; onFinish: () => void }) {
  const [quiet] = useState(calm);
  const [message, setMessage] = useState("Starting");
  const [active, setActive] = useState<Agent | null>(null);
  const stage = useRef<HTMLElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const pick = useRef<HTMLDivElement>(null);
  const cursors = useRef<Partial<Record<Agent, HTMLDivElement | null>>>({});
  const result = useRef(session);
  const finish = useRef(onFinish);

  useEffect(() => {
    result.current = session;
    finish.current = onFinish;
  });

  useEffect(() => {
    if (quiet && session) finish.current();
  }, [quiet, session]);

  useEffect(() => {
    if (quiet) return;
    stage.current?.scrollIntoView?.({ block: "start" }); // the button that starts it sits lower
    let live = true;
    const page = inner.current!;
    const sleep = (ms: number) =>
      new Promise<void>((resolve, reject) => setTimeout(() => (live ? resolve() : reject(new Error("left"))), ms));
    const find = (k: string) => page.querySelector<HTMLElement>(`[data-k="${k}"]`);
    const say = (agent: Agent | null, text: string) => {
      setActive(agent);
      setMessage(text);
    };
    const place = (agent: Agent, el: HTMLElement) => {
      let top = 0;
      let left = 0;
      for (let n: HTMLElement | null = el; n && n !== page; n = n.offsetParent as HTMLElement | null) {
        top += n.offsetTop;
        left += n.offsetLeft;
      }
      const room = Math.max(0, page.scrollHeight - paper.current!.clientHeight);
      const scroll = Math.min(room, Math.max(0, top - VIEW_OFFSET));
      page.style.transform = `translateY(${-scroll}px)`;
      const y = top - scroll + paper.current!.offsetTop;
      const x = left + paper.current!.offsetLeft;
      const box = pick.current!;
      box.style.opacity = "1";
      box.style.borderColor = AGENTS[agent].color;
      box.style.transform = `translate(${x - 4}px, ${y - 3}px)`;
      box.style.width = `${el.offsetWidth + 8}px`;
      box.style.height = `${el.offsetHeight + 6}px`;
      for (const [name, cursor] of Object.entries(cursors.current)) {
        if (cursor) cursor.style.opacity = name === agent ? "1" : "0";
      }
      const cursor = cursors.current[agent];
      if (cursor) cursor.style.transform = `translate(${x + Math.min(el.offsetWidth * 0.7, 300)}px, ${y + el.offsetHeight * 0.6}px)`;
    };
    const lines = [...page.querySelectorAll<HTMLElement>("[data-bullet]")];
    const started = Date.now();
    const spent = () => Date.now() - started;

    const wait = async () => {
      say("reader", "Reader is reading your resume");
      for (const el of page.querySelectorAll<HTMLElement>(".agent-line")) {
        el.dataset.on = "";
        place("reader", el);
        if (result.current) return;
        await sleep(420);
      }
      say("matcher", "Matcher is comparing your skills with the job");
      for (const chip of [...page.querySelectorAll<HTMLElement>("[data-skill]")].slice(0, 8)) {
        place("matcher", chip);
        if (result.current || spent() > WRITING_AT_MS) break;
        await sleep(450);
      }
      // Bullets in turn, across the whole resume, until the real answer arrives.
      const step = Math.max(1, Math.floor(lines.length / 12));
      for (let i = 0; !result.current; i += step) {
        const writing = spent() < CHECKING_AT_MS;
        say(writing ? "writer" : "checker", writing ? "Writer is rewriting your bullets" : "Fact Checker is checking every change");
        const el = lines[i % Math.max(1, lines.length)] ?? find("summary") ?? find("name");
        if (el) place(writing ? "writer" : "checker", el);
        await sleep(900);
      }
    };

    const type = async (el: HTMLElement, to: string) => {
      const step = Math.ceil(to.length / 16);
      for (let i = step; i < to.length; i += step) {
        el.textContent = to.slice(0, i);
        await sleep(16);
      }
      el.textContent = to;
    };

    const target = (edit: AgentEdit) => {
      if (edit.kind !== "bullet") return find(edit.kind);
      return lines.find((l) => l.textContent === edit.from) ?? null;
    };

    const reveal = async (done: Session) => {
      page.querySelectorAll<HTMLElement>(".agent-line").forEach((el) => (el.dataset.on = ""));
      const all = agentEdits(done);
      const shown = all.map((e) => ({ e, el: target(e) })).filter((x) => x.el).slice(0, SHOWN_EDITS);
      const gone = new Set(removedSkills(done));
      if (gone.size) {
        say("matcher", "Matcher is taking out what the job doesn't need");
        for (const chip of page.querySelectorAll<HTMLElement>("[data-skill]")) {
          if (gone.has(chip.dataset.skill ?? "")) chip.dataset.gone = "";
        }
        const skills = find("skills");
        if (skills) place("matcher", skills);
        await sleep(450);
      }
      say("writer", "Writer is putting in the new wording");
      for (const { e, el } of shown) {
        place("writer", el!);
        await sleep(240);
        el!.dataset.state = "writing";
        await type(el!.querySelector("span") ?? el!, e.to);
      }
      say("checker", "Fact Checker is marking each change");
      for (const { e, el } of shown) {
        place("checker", el!);
        await sleep(150);
        el!.dataset.state = e.flagged ? "review" : "ok";
      }
      pick.current!.style.opacity = "0";
      Object.values(cursors.current).forEach((c) => c && (c.style.opacity = "0"));
      const review = all.filter((e) => e.flagged).length;
      say(null, `${all.length} rewrite${all.length === 1 ? "" : "s"} ready${review ? `, ${review} for you to check` : ", all checked"}`);
      await sleep(800);
      finish.current();
    };

    void (async () => {
      await sleep(250);
      await wait();
      if (result.current) await reveal(result.current);
    })().catch(() => undefined); // left the page mid-way
    return () => {
      live = false;
    };
  }, [quiet]);

  if (quiet) return <AiProgress title="Tailoring with maximum focus" seconds={35} steps={STEPS} />;
  return (
    <section ref={stage} aria-label="Tailoring your resume" className="relative isolate h-[640px] scroll-mt-20 overflow-hidden rounded-panel bg-ink-deep ring-1 ring-on-ink/10">
      <div aria-hidden className="absolute inset-0 -z-10 bg-grid text-on-ink [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div ref={paper} aria-hidden className="absolute inset-x-4 top-4 bottom-20 mx-auto max-w-xl overflow-hidden rounded bg-[#ffffff]">
        <div ref={inner} className="relative p-6 transition-transform duration-500 ease-out">
          <Page doc={before} />
        </div>
      </div>
      <div ref={pick} aria-hidden className="absolute left-0 top-0 z-10 rounded-sm border-[1.5px] opacity-0 transition-all duration-500 ease-out" />
      {(Object.keys(AGENTS) as Agent[]).map((key) => (
        <div
          key={key}
          ref={(el) => {
            cursors.current[key] = el;
          }}
          aria-hidden
          className="absolute left-0 top-0 z-20 opacity-0 transition-[transform,opacity] duration-500 ease-out"
        >
          <svg width="16" height="18" viewBox="0 0 16 18"><path d="M1 1l5 15 2.5-6.5L15 7z" fill={AGENTS[key].color} stroke="#fff" /></svg>
          <span className="absolute left-3 top-4 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#0c0f0e]" style={{ background: AGENTS[key].color }}>
            {AGENTS[key].name}
          </span>
        </div>
      ))}
      <div className="absolute inset-x-4 bottom-4 mx-auto flex h-12 max-w-xl items-center gap-3 rounded-control bg-on-ink/10 px-4 text-on-ink ring-1 ring-on-ink/10">
        <span aria-hidden className="flex gap-1.5">
          {(Object.keys(AGENTS) as Agent[]).map((key) => (
            <span key={key} className="size-2 rounded-full transition-opacity duration-300" style={{ background: AGENTS[key].color, opacity: active === key ? 1 : 0.3 }} />
          ))}
        </span>
        <p role="status" aria-live="polite" className="min-w-0 flex-1 truncate text-body-sm">{message}</p>
        {session ? <Button size="sm" variant="secondary" onClick={() => finish.current()}>See my changes</Button> : null}
      </div>
    </section>
  );
}
