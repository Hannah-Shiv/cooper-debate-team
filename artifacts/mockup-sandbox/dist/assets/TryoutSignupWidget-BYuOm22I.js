import{r as i,j as e}from"./index-CFALV-1w.js";const S=t=>t.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),_=t=>t.replace(/^([A-Z])|[\s-_]+(\w)/g,(s,r,n)=>n?n.toUpperCase():r.toLowerCase()),v=t=>{const s=_(t);return s.charAt(0).toUpperCase()+s.slice(1)},z=(...t)=>t.filter((s,r,n)=>!!s&&s.trim()!==""&&n.indexOf(s)===r).join(" ").trim(),$=t=>{for(const s in t)if(s.startsWith("aria-")||s==="role"||s==="title")return!0};var D={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};const A=i.forwardRef(({color:t="currentColor",size:s=24,strokeWidth:r=2,absoluteStrokeWidth:n,className:l="",children:d,iconNode:g,...m},y)=>i.createElement("svg",{ref:y,...D,width:s,height:s,stroke:t,strokeWidth:n?Number(r)*24/Number(s):r,className:z("lucide",l),...!d&&!$(m)&&{"aria-hidden":"true"},...m},[...g.map(([k,h])=>i.createElement(k,h)),...Array.isArray(d)?d:[d]]));const o=(t,s)=>{const r=i.forwardRef(({className:n,...l},d)=>i.createElement(A,{ref:d,iconNode:s,className:z(`lucide-${S(v(t))}`,`lucide-${t}`,n),...l}));return r.displayName=v(t),r};const P=[["path",{d:"M5 12h14",key:"1ays0h"}],["path",{d:"m12 5 7 7-7 7",key:"xquz4c"}]],R=o("arrow-right",P);const q=[["path",{d:"M8 2v4",key:"1cmpym"}],["path",{d:"M16 2v4",key:"4m81vk"}],["rect",{width:"18",height:"18",x:"3",y:"4",rx:"2",key:"1hopcy"}],["path",{d:"M3 10h18",key:"8toen8"}],["path",{d:"M8 14h.01",key:"6423bh"}],["path",{d:"M12 14h.01",key:"1etili"}],["path",{d:"M16 14h.01",key:"1gbofw"}],["path",{d:"M8 18h.01",key:"lrp35t"}],["path",{d:"M12 18h.01",key:"mhygvu"}],["path",{d:"M16 18h.01",key:"kzsmim"}]],T=o("calendar-days",q);const Y=[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]],F=o("check",Y);const L=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],W=o("chevron-right",L);const E=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],f=o("circle-check",E);const U=[["path",{d:"M12 6v6h4",key:"135r8i"}],["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]],B=o("clock-3",U);const G=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 16v-4",key:"1dtifu"}],["path",{d:"M12 8h.01",key:"e9boi3"}]],I=o("info",G);const O=[["path",{d:"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",key:"1r0f0z"}],["circle",{cx:"12",cy:"10",r:"3",key:"ilqhr7"}]],K=o("map-pin",O);const Z=[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],H=o("shield-check",Z);const J=[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}],["path",{d:"M20 2v4",key:"1rf3ol"}],["path",{d:"M22 4h-4",key:"gwowj6"}],["circle",{cx:"4",cy:"20",r:"2",key:"6kqj1y"}]],u=o("sparkles",J);const V=[["path",{d:"M2 21a8 8 0 0 1 13.292-6",key:"bjp14o"}],["circle",{cx:"10",cy:"8",r:"5",key:"o932ke"}],["path",{d:"M19 16v6",key:"tddt3s"}],["path",{d:"M22 19h-6",key:"vcuq98"}]],Q=o("user-round-plus",V);const X=[["path",{d:"M18 21a8 8 0 0 0-16 0",key:"3ypg7q"}],["circle",{cx:"10",cy:"8",r:"5",key:"o932ke"}],["path",{d:"M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3",key:"10s06x"}]],ee=o("users-round",X),x={sep22:{weekday:"Tuesday",date:"September 22",shortDate:"Sept 22",location:"Cafeteria"},sep23:{weekday:"Wednesday",date:"September 23",shortDate:"Sept 23",location:"Lecture Hall"}},N=[{id:"alex",name:"Alex R.",grade:"8th grade",dates:["sep22","sep23"],tint:"gold"},{id:"maya",name:"Maya J.",grade:"8th grade",dates:["sep22"],tint:"blue"},{id:"sam",name:"Sam K.",grade:"7th grade",dates:["sep22","sep23"],tint:"violet"},{id:"noah",name:"Noah C.",grade:"7th grade",dates:["sep23"],tint:"teal"}];function te(){const[t,s]=i.useState("sep22"),[r,n]=i.useState("partner"),[l,d]=i.useState("maya"),[g,m]=i.useState(""),[y,k]=i.useState(""),[h,p]=i.useState(!1),j=i.useMemo(()=>N.filter(a=>a.dates.includes(t)),[t]);function C(a){s(a),d(null),p(!1)}function w(a){n(a),a==="assign"&&d(null),p(!1)}function M(){g.trim()&&p(!0)}return e.jsxs("main",{className:"tryout-widget",children:[e.jsx("style",{children:`
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
      `}),e.jsxs("div",{className:"widget-shell",children:[e.jsxs("header",{className:"brand-bar",children:[e.jsxs("div",{className:"brand",children:[e.jsx("span",{className:"brand-mark",children:"C"}),"Cooper ",e.jsx("span",{children:"Debate Team"})]}),e.jsxs("div",{className:"deadline-pill",children:[e.jsx(B,{size:12}),"Sign up by Sept 18"]})]}),e.jsxs("div",{className:"eyebrow",children:[e.jsx(u,{size:13})," Fall 2026 team selection"]}),e.jsx("h1",{children:"Tryout sign-up"}),e.jsx("p",{className:"intro",children:"Choose your date and tell us how you want to partner. You can request someone who has also opted in—or let Ms. Konde make the match."}),e.jsxs("div",{className:"progress","aria-label":"Sign-up progress",children:[e.jsxs("div",{className:"progress-step active",children:[e.jsx("span",{className:"progress-number",children:"1"}),"Choose your date"]}),e.jsxs("div",{className:"progress-step",children:[e.jsx("span",{className:"progress-number",children:"2"}),"Choose your partner"]})]}),e.jsxs("section",{className:"panel date-panel","aria-labelledby":"date-heading",children:[e.jsxs("div",{className:"section-heading",children:[e.jsx("span",{className:"heading-icon",children:e.jsx(T,{size:17})}),e.jsxs("div",{children:[e.jsx("h2",{id:"date-heading",children:"Select your tryout date"}),e.jsx("p",{children:"Both sessions run after school from 2:30–4:30 PM."})]})]}),e.jsx("div",{className:"date-options",children:Object.keys(x).map(a=>{const c=x[a],b=t===a;return e.jsxs("button",{className:`date-card${b?" selected":""}`,onClick:()=>C(a),type:"button","aria-pressed":b,children:[e.jsx("span",{className:"check",children:e.jsx(F,{size:12,strokeWidth:3})}),e.jsx("span",{className:"date-weekday",children:c.weekday}),e.jsx("span",{className:"date-title",children:c.date}),e.jsxs("span",{className:"date-meta",children:[e.jsx(K,{size:12}),c.location]})]},a)})})]}),e.jsxs("section",{className:"panel pairing-panel","aria-labelledby":"pairing-heading",children:[e.jsxs("div",{className:"section-heading",children:[e.jsx("span",{className:"heading-icon",children:e.jsx(ee,{size:17})}),e.jsxs("div",{children:[e.jsx("h2",{id:"pairing-heading",children:"Choose your partner"}),e.jsx("p",{children:"Partners are confirmed only when both students choose each other."})]})]}),e.jsxs("div",{className:"mode-toggle",children:[e.jsxs("button",{className:`mode-button${r==="partner"?" active":""}`,onClick:()=>w("partner"),type:"button",children:[e.jsx(Q,{size:17}),e.jsxs("span",{children:[e.jsx("strong",{children:"Pick a partner"}),e.jsx("small",{children:"Choose from students who opted in"})]})]}),e.jsxs("button",{className:`mode-button${r==="assign"?" active":""}`,onClick:()=>w("assign"),type:"button",children:[e.jsx(u,{size:17}),e.jsxs("span",{children:[e.jsx("strong",{children:"Let Coach pair me"}),e.jsx("small",{children:"Stay open for an assignment"})]})]})]}),r==="partner"?e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"list-label",children:[e.jsx("span",{children:"Students open to pairing"}),e.jsxs("span",{children:[j.length," available for ",x[t].shortDate]})]}),e.jsx("div",{className:"student-list",children:j.map(a=>{const c=l===a.id;return e.jsxs("button",{className:`student-option${c?" selected":""}`,onClick:()=>{d(a.id),p(!1)},type:"button","aria-pressed":c,children:[e.jsx("span",{className:`avatar ${a.tint}`,children:a.name.replace(".","").split(" ").map(b=>b[0]).join("")}),e.jsxs("span",{className:"student-copy",children:[e.jsx("strong",{children:a.name}),e.jsxs("span",{children:[a.grade," · ",a.dates.length>1?"Available either day":`Available ${x[a.dates[0]].shortDate}`]})]}),e.jsxs("span",{className:"student-state",children:[e.jsx(f,{size:12}),"Opted in"]}),c?e.jsx(f,{size:17}):e.jsx(W,{size:16})]},a.id)})}),e.jsxs("div",{className:"info-callout",children:[e.jsx(I,{size:15}),"Your choice sends a request—not a final pairing. The other student must choose you back, and Ms. Konde confirms the final pair."]})]}):e.jsxs("div",{className:"info-callout",style:{marginTop:0,borderColor:"rgba(108, 224, 200, .3)",background:"rgba(42, 149, 135, .12)"},children:[e.jsx(u,{size:15}),"You’ll be listed as ",e.jsx("strong",{style:{color:"#e9fffa"},children:"Waiting to be paired"}),". Ms. Konde will match you with a teammate who fits the same tryout date."]}),e.jsxs("div",{className:"your-details",children:[e.jsxs("div",{className:"field",children:[e.jsx("label",{htmlFor:"student-name",children:"Your name"}),e.jsx("input",{id:"student-name",value:g,onChange:a=>{m(a.target.value),p(!1)},placeholder:"First and last name"})]}),e.jsxs("div",{className:"field",children:[e.jsx("label",{htmlFor:"grade",children:"Grade"}),e.jsxs("select",{id:"grade",value:y,onChange:a=>{k(a.target.value),p(!1)},children:[e.jsx("option",{value:"",children:"Select"}),e.jsx("option",{value:"6",children:"6th"}),e.jsx("option",{value:"7",children:"7th"}),e.jsx("option",{value:"8",children:"8th"})]})]})]}),e.jsxs("div",{className:"selection-strip",children:[e.jsxs("div",{children:[e.jsx("div",{className:"selection-label",children:"Your selection"}),e.jsxs("div",{className:"selection-value",children:[x[t].shortDate," ",e.jsxs("span",{children:["· ",r==="partner"&&l?N.find(a=>a.id===l)?.name:"Waiting for Coach"]})]})]}),e.jsxs("span",{className:"selection-status",children:[e.jsx(f,{size:14})," Ready"]})]}),e.jsx("button",{className:`submit-button${h?" success":""}`,disabled:!g.trim()||h,onClick:M,type:"button",children:h?e.jsxs(e.Fragment,{children:["Sign-up received ",e.jsx(f,{size:16})]}):e.jsxs(e.Fragment,{children:["Submit my sign-up ",e.jsx(R,{size:16})," "]})}),e.jsxs("div",{className:"privacy-note",children:[e.jsx(H,{size:12})," Your details are visible only to Cooper Debate coaches."]})]}),e.jsxs("p",{className:"footer-note",children:[e.jsx(u,{size:15})," Team membership will be determined later that week. Tuesday practices begin September 29."]})]})]})}export{te as TryoutSignupWidget};
