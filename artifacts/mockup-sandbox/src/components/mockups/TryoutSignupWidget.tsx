import { useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Info,
  MapPin,
  ShieldCheck,
  Sparkles,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";

type TryoutDate = "sep22" | "sep23";
type PairingMode = "partner" | "assign";

const dates = {
  sep22: {
    weekday: "Tuesday",
    date: "September 22",
    shortDate: "Sept 22",
    location: "Cafeteria",
  },
  sep23: {
    weekday: "Wednesday",
    date: "September 23",
    shortDate: "Sept 23",
    location: "Lecture Hall",
  },
} satisfies Record<TryoutDate, { weekday: string; date: string; shortDate: string; location: string }>;

const students = [
  { id: "alex", name: "Alex R.", grade: "8th grade", dates: ["sep22", "sep23"] as TryoutDate[], tint: "gold" },
  { id: "maya", name: "Maya J.", grade: "8th grade", dates: ["sep22"] as TryoutDate[], tint: "blue" },
  { id: "sam", name: "Sam K.", grade: "7th grade", dates: ["sep22", "sep23"] as TryoutDate[], tint: "violet" },
  { id: "noah", name: "Noah C.", grade: "7th grade", dates: ["sep23"] as TryoutDate[], tint: "teal" },
];

export function TryoutSignupWidget() {
  const [date, setDate] = useState<TryoutDate>("sep22");
  const [mode, setMode] = useState<PairingMode>("partner");
  const [selectedPartner, setSelectedPartner] = useState<string | null>("maya");
  const [studentName, setStudentName] = useState("");
  const [grade, setGrade] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const availableStudents = useMemo(
    () => students.filter((student) => student.dates.includes(date)),
    [date],
  );

  function chooseDate(nextDate: TryoutDate) {
    setDate(nextDate);
    setSelectedPartner(null);
    setSubmitted(false);
  }

  function chooseMode(nextMode: PairingMode) {
    setMode(nextMode);
    if (nextMode === "assign") setSelectedPartner(null);
    setSubmitted(false);
  }

  function submitSignup() {
    if (!studentName.trim()) return;
    setSubmitted(true);
  }

  return (
    <main className="tryout-widget">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');

        :root {
          color-scheme: dark;
          font-family: 'DM Sans', sans-serif;
        }

        * { box-sizing: border-box; }
        button, input, select { font: inherit; }
        button { cursor: pointer; }

        .tryout-widget {
          min-height: 100vh;
          padding: 22px;
          color: #f5f7ff;
          background:
            radial-gradient(circle at 90% 0%, rgba(27, 115, 255, .25), transparent 32%),
            radial-gradient(circle at 8% 95%, rgba(111, 76, 255, .14), transparent 27%),
            #060e23;
        }

        .widget-shell {
          width: min(100%, 720px);
          margin: 0 auto;
        }

        .brand-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 2px 18px;
          border-bottom: 1px solid rgba(157, 187, 255, .16);
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          letter-spacing: .12em;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .brand-mark {
          display: grid;
          place-items: center;
          width: 31px;
          height: 31px;
          color: #07122c;
          border: 2px solid #f4bc19;
          border-radius: 10px 10px 10px 2px;
          background: linear-gradient(135deg, #f4bc19, #ffdc67);
          box-shadow: 0 0 18px rgba(244, 188, 25, .28);
          font-size: 13px;
          font-weight: 800;
        }

        .brand span { color: #f4c83d; }

        .deadline-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #ffd96d;
          border: 1px solid rgba(244, 188, 25, .34);
          border-radius: 999px;
          background: rgba(244, 188, 25, .08);
          padding: 7px 10px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .04em;
          white-space: nowrap;
        }

        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          margin: 26px 0 8px;
          color: #65d8ca;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        h1, h2, p { margin: 0; }
        h1 {
          max-width: 520px;
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(31px, 7vw, 49px);
          line-height: .99;
          letter-spacing: -.035em;
        }

        .intro {
          max-width: 555px;
          margin-top: 10px;
          color: #aebbd6;
          font-size: 13px;
          line-height: 1.55;
        }

        .progress {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin: 22px 0 13px;
        }

        .progress-step {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 38px;
          padding: 8px 11px;
          color: #7183a7;
          border: 1px solid rgba(157, 187, 255, .14);
          border-radius: 10px;
          background: rgba(12, 26, 60, .58);
          font-size: 11px;
          font-weight: 700;
        }

        .progress-step.active {
          color: #fff;
          border-color: rgba(244, 188, 25, .72);
          background: linear-gradient(105deg, rgba(244, 188, 25, .15), rgba(15, 58, 129, .4));
          box-shadow: 0 0 18px rgba(244, 188, 25, .08);
        }

        .progress-number {
          display: grid;
          place-items: center;
          width: 22px;
          height: 22px;
          border: 1px solid currentColor;
          border-radius: 50%;
          font-size: 10px;
        }

        .panel {
          border: 1px solid rgba(116, 161, 255, .25);
          border-radius: 16px;
          background: linear-gradient(145deg, rgba(11, 31, 72, .92), rgba(7, 17, 42, .94));
          box-shadow: 0 20px 55px rgba(0, 0, 0, .2), inset 0 1px 0 rgba(255,255,255,.04);
        }

        .date-panel { padding: 16px; }
        .section-heading {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 13px;
        }

        .heading-icon {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 31px;
          height: 31px;
          color: #67a6ff;
          border: 1px solid rgba(103, 166, 255, .4);
          border-radius: 9px;
          background: rgba(27, 99, 212, .15);
        }

        .section-heading h2 {
          font-size: 13px;
          line-height: 1.2;
        }

        .section-heading p {
          margin-top: 4px;
          color: #91a4ca;
          font-size: 11px;
          line-height: 1.4;
        }

        .date-options {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .date-card {
          position: relative;
          display: block;
          width: 100%;
          padding: 13px;
          color: #d8e4ff;
          border: 1px solid rgba(120, 157, 225, .26);
          border-radius: 12px;
          background: rgba(5, 16, 41, .68);
          text-align: left;
          transition: border-color .18s ease, transform .18s ease, background .18s ease;
        }

        .date-card:hover { transform: translateY(-2px); border-color: rgba(103, 166, 255, .7); }
        .date-card.selected {
          color: #fff;
          border-color: #f4bc19;
          background: linear-gradient(135deg, rgba(24, 74, 160, .78), rgba(10, 33, 81, .92));
          box-shadow: 0 0 0 1px rgba(244, 188, 25, .2), 0 10px 24px rgba(0, 0, 0, .18);
        }

        .date-card .check {
          position: absolute;
          top: 10px;
          right: 10px;
          display: grid;
          place-items: center;
          width: 18px;
          height: 18px;
          color: #06122b;
          border-radius: 50%;
          background: #f4bc19;
          opacity: 0;
        }

        .date-card.selected .check { opacity: 1; }
        .date-weekday {
          display: block;
          color: #7c9bce;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .date-card.selected .date-weekday { color: #c9d9ff; }
        .date-title {
          display: block;
          margin-top: 5px;
          font-size: 15px;
          font-weight: 700;
        }
        .date-meta {
          display: flex;
          align-items: center;
          gap: 5px;
          margin-top: 9px;
          color: #a9b9d6;
          font-size: 10px;
        }
        .date-meta svg { color: #f4bc19; }

        .pairing-panel {
          margin-top: 12px;
          padding: 16px;
        }

        .mode-toggle {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 12px;
        }

        .mode-button {
          display: flex;
          align-items: center;
          gap: 8px;
          min-height: 48px;
          padding: 9px 11px;
          color: #9bb0d5;
          border: 1px solid rgba(128, 161, 222, .2);
          border-radius: 10px;
          background: rgba(5, 15, 38, .58);
          text-align: left;
        }
        .mode-button strong { display: block; color: #e9efff; font-size: 11px; }
        .mode-button small { display: block; margin-top: 3px; color: #7f94bc; font-size: 9px; }
        .mode-button.active {
          border-color: rgba(111, 217, 193, .7);
          background: rgba(42, 149, 135, .13);
        }
        .mode-button.active svg { color: #6ce0c8; }

        .list-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin: 2px 0 8px;
          color: #9fb0cf;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .08em;
          text-transform: uppercase;
        }
        .list-label span:last-child {
          color: #65d8ca;
          font-weight: 600;
          letter-spacing: 0;
          text-transform: none;
        }

        .student-list { display: grid; gap: 7px; }
        .student-option {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 9px 10px;
          color: #eaf0ff;
          border: 1px solid rgba(128, 161, 222, .19);
          border-radius: 10px;
          background: rgba(7, 18, 44, .62);
          text-align: left;
        }
        .student-option:hover { border-color: rgba(103, 166, 255, .65); }
        .student-option.selected {
          border-color: #6ce0c8;
          background: linear-gradient(90deg, rgba(45, 158, 140, .16), rgba(13, 39, 82, .72));
        }
        .avatar {
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          font-size: 10px;
          font-weight: 800;
        }
        .avatar.gold { color: #07122c; background: #f4c53a; }
        .avatar.blue { color: #dbeaff; background: #2364c7; }
        .avatar.violet { color: #f1e7ff; background: #6f4bd6; }
        .avatar.teal { color: #052321; background: #56d5c0; }
        .student-copy { flex: 1; min-width: 0; }
        .student-copy strong { display: block; font-size: 11px; }
        .student-copy span { display: block; margin-top: 2px; color: #8ea1c4; font-size: 10px; }
        .student-state {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #6ce0c8;
          font-size: 9px;
          font-weight: 700;
          white-space: nowrap;
        }
        .student-state svg { width: 12px; height: 12px; }
        .student-option > svg { color: #8097c0; }
        .student-option.selected > svg { color: #6ce0c8; }

        .info-callout {
          display: flex;
          gap: 8px;
          margin-top: 11px;
          padding: 10px 11px;
          color: #aab9d4;
          border: 1px solid rgba(103, 166, 255, .18);
          border-radius: 9px;
          background: rgba(35, 94, 187, .1);
          font-size: 10px;
          line-height: 1.45;
        }
        .info-callout svg { flex: 0 0 auto; color: #72aaff; }

        .your-details {
          display: grid;
          grid-template-columns: 1.4fr .8fr;
          gap: 9px;
          margin-top: 12px;
        }
        .field label {
          display: block;
          margin: 0 0 5px 2px;
          color: #9fb0cf;
          font-size: 10px;
          font-weight: 700;
        }
        .field input, .field select {
          width: 100%;
          min-height: 38px;
          padding: 0 10px;
          color: #edf3ff;
          outline: none;
          border: 1px solid rgba(128, 161, 222, .24);
          border-radius: 8px;
          background: rgba(3, 12, 31, .75);
        }
        .field input:focus, .field select:focus { border-color: #68a8ff; box-shadow: 0 0 0 3px rgba(55, 129, 244, .13); }
        .field input::placeholder { color: #61769e; }
        .field select { color: #d6e2f8; }

        .selection-strip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 12px;
          padding: 10px 11px;
          border: 1px solid rgba(244, 188, 25, .24);
          border-radius: 9px;
          background: rgba(244, 188, 25, .07);
        }
        .selection-strip > div { min-width: 0; }
        .selection-label { color: #e8bd3f; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
        .selection-value { overflow: hidden; margin-top: 3px; color: #f9fbff; font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .selection-value span { color: #9db0d3; font-weight: 500; }
        .selection-status { display: inline-flex; align-items: center; gap: 5px; color: #6ce0c8; font-size: 10px; font-weight: 700; white-space: nowrap; }

        .submit-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          min-height: 44px;
          margin-top: 12px;
          color: #07132b;
          border: 0;
          border-radius: 9px;
          background: linear-gradient(100deg, #f2b91c, #ffd764);
          box-shadow: 0 9px 22px rgba(244, 188, 25, .16);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .02em;
        }
        .submit-button:hover { filter: brightness(1.06); transform: translateY(-1px); }
        .submit-button:disabled { cursor: not-allowed; opacity: .5; transform: none; }
        .submit-button.success { color: #06211f; background: linear-gradient(100deg, #62dbc5, #a2f0d1); }

        .privacy-note {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          margin-top: 11px;
          color: #7386aa;
          font-size: 9px;
        }
        .privacy-note svg { color: #6ce0c8; }

        .footer-note {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          margin: 14px 2px 0;
          color: #93a7ca;
          font-size: 10px;
          line-height: 1.45;
        }
        .footer-note svg { flex: 0 0 auto; color: #f4c53a; }

        @media (max-width: 450px) {
          .tryout-widget { padding: 15px; }
          .deadline-pill { padding: 6px 8px; font-size: 9px; }
          .date-panel, .pairing-panel { padding: 13px; }
          .your-details { grid-template-columns: 1fr; }
          .student-state { display: none; }
        }
      `}</style>

      <div className="widget-shell">
        <header className="brand-bar">
          <div className="brand">
            <span className="brand-mark">C</span>
            Cooper <span>Debate Team</span>
          </div>
          <div className="deadline-pill">
            <Clock3 size={12} />
            Sign up by Sept 18
          </div>
        </header>

        <div className="eyebrow"><Sparkles size={13} /> Fall 2026 team selection</div>
        <h1>Tryout sign-up</h1>
        <p className="intro">
          Choose your date and tell us how you want to partner. You can request someone who has also opted in—or let Ms. Konde make the match.
        </p>

        <div className="progress" aria-label="Sign-up progress">
          <div className="progress-step active"><span className="progress-number">1</span>Choose your date</div>
          <div className="progress-step"><span className="progress-number">2</span>Choose your partner</div>
        </div>

        <section className="panel date-panel" aria-labelledby="date-heading">
          <div className="section-heading">
            <span className="heading-icon"><CalendarDays size={17} /></span>
            <div>
              <h2 id="date-heading">Select your tryout date</h2>
              <p>Both sessions run after school from 2:30–4:30 PM.</p>
            </div>
          </div>
          <div className="date-options">
            {(Object.keys(dates) as TryoutDate[]).map((dateKey) => {
              const option = dates[dateKey];
              const isSelected = date === dateKey;
              return (
                <button
                  className={`date-card${isSelected ? " selected" : ""}`}
                  key={dateKey}
                  onClick={() => chooseDate(dateKey)}
                  type="button"
                  aria-pressed={isSelected}
                >
                  <span className="check"><Check size={12} strokeWidth={3} /></span>
                  <span className="date-weekday">{option.weekday}</span>
                  <span className="date-title">{option.date}</span>
                  <span className="date-meta"><MapPin size={12} />{option.location}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel pairing-panel" aria-labelledby="pairing-heading">
          <div className="section-heading">
            <span className="heading-icon"><UsersRound size={17} /></span>
            <div>
              <h2 id="pairing-heading">Choose your partner</h2>
              <p>Partners are confirmed only when both students choose each other.</p>
            </div>
          </div>

          <div className="mode-toggle">
            <button className={`mode-button${mode === "partner" ? " active" : ""}`} onClick={() => chooseMode("partner")} type="button">
              <UserRoundPlus size={17} />
              <span><strong>Pick a partner</strong><small>Choose from students who opted in</small></span>
            </button>
            <button className={`mode-button${mode === "assign" ? " active" : ""}`} onClick={() => chooseMode("assign")} type="button">
              <Sparkles size={17} />
              <span><strong>Let Coach pair me</strong><small>Stay open for an assignment</small></span>
            </button>
          </div>

          {mode === "partner" ? (
            <>
              <div className="list-label">
                <span>Students open to pairing</span>
                <span>{availableStudents.length} available for {dates[date].shortDate}</span>
              </div>
              <div className="student-list">
                {availableStudents.map((student) => {
                  const isSelected = selectedPartner === student.id;
                  return (
                    <button
                      className={`student-option${isSelected ? " selected" : ""}`}
                      key={student.id}
                      onClick={() => { setSelectedPartner(student.id); setSubmitted(false); }}
                      type="button"
                      aria-pressed={isSelected}
                    >
                      <span className={`avatar ${student.tint}`}>{student.name.replace(".", "").split(" ").map((part) => part[0]).join("")}</span>
                      <span className="student-copy"><strong>{student.name}</strong><span>{student.grade} · {student.dates.length > 1 ? "Available either day" : `Available ${dates[student.dates[0]].shortDate}`}</span></span>
                      <span className="student-state"><CheckCircle2 size={12} />Opted in</span>
                      {isSelected ? <CheckCircle2 size={17} /> : <ChevronRight size={16} />}
                    </button>
                  );
                })}
              </div>
              <div className="info-callout"><Info size={15} />Your choice sends a request—not a final pairing. The other student must choose you back, and Ms. Konde confirms the final pair.</div>
            </>
          ) : (
            <div className="info-callout" style={{ marginTop: 0, borderColor: "rgba(108, 224, 200, .3)", background: "rgba(42, 149, 135, .12)" }}>
              <Sparkles size={15} />
              You’ll be listed as <strong style={{ color: "#e9fffa" }}>Waiting to be paired</strong>. Ms. Konde will match you with a teammate who fits the same tryout date.
            </div>
          )}

          <div className="your-details">
            <div className="field">
              <label htmlFor="student-name">Your name</label>
              <input id="student-name" value={studentName} onChange={(event) => { setStudentName(event.target.value); setSubmitted(false); }} placeholder="First and last name" />
            </div>
            <div className="field">
              <label htmlFor="grade">Grade</label>
              <select id="grade" value={grade} onChange={(event) => { setGrade(event.target.value); setSubmitted(false); }}>
                <option value="">Select</option>
                <option value="6">6th</option>
                <option value="7">7th</option>
                <option value="8">8th</option>
              </select>
            </div>
          </div>

          <div className="selection-strip">
            <div>
              <div className="selection-label">Your selection</div>
              <div className="selection-value">{dates[date].shortDate} <span>· {mode === "partner" && selectedPartner ? students.find((student) => student.id === selectedPartner)?.name : "Waiting for Coach"}</span></div>
            </div>
            <span className="selection-status"><CheckCircle2 size={14} /> Ready</span>
          </div>

          <button className={`submit-button${submitted ? " success" : ""}`} disabled={!studentName.trim() || submitted} onClick={submitSignup} type="button">
            {submitted ? <>Sign-up received <CheckCircle2 size={16} /></> : <>Submit my sign-up <ArrowRight size={16} /> </>}
          </button>
          <div className="privacy-note"><ShieldCheck size={12} /> Your details are visible only to Cooper Debate coaches.</div>
        </section>

        <p className="footer-note"><Sparkles size={15} /> Team membership will be determined later that week. Tuesday practices begin September 29.</p>
      </div>
    </main>
  );
}