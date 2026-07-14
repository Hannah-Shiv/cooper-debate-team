from fpdf import FPDF
from fpdf.enums import XPos, YPos

class RoadmapPDF(FPDF):
    def __init__(self):
        super().__init__()
        self.set_margins(18, 18, 18)
        self.set_auto_page_break(auto=True, margin=20)

    def header(self):
        self.set_fill_color(11, 37, 69)
        self.rect(0, 0, 210, 14, 'F')
        self.set_font('Helvetica', 'B', 9)
        self.set_text_color(212, 160, 23)
        self.set_y(4)
        self.cell(0, 6, 'COOPER DEBATE TEAM  |  Website Feature Roadmap', align='C')
        self.set_text_color(0, 0, 0)
        self.ln(12)

    def footer(self):
        self.set_y(-12)
        self.set_font('Helvetica', '', 7.5)
        self.set_text_color(130, 130, 130)
        self.cell(0, 6, f'Page {self.page_no()}  |  Cooper Debate Team   -   CooperDebateTeam.com  |  Confidential', align='C')
        self.set_text_color(0, 0, 0)

    def cover_block(self):
        self.set_fill_color(11, 37, 69)
        self.rect(0, 14, 210, 70, 'F')
        self.set_y(24)
        self.set_font('Helvetica', 'B', 28)
        self.set_text_color(255, 255, 255)
        self.cell(0, 13, 'Cooper Debate Team', align='C', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font('Helvetica', 'B', 16)
        self.set_text_color(212, 160, 23)
        self.cell(0, 9, 'Website Feature Roadmap', align='C', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(2)
        self.set_font('Helvetica', '', 10)
        self.set_text_color(180, 200, 230)
        self.cell(0, 7, 'Cooper Middle School, McLean VA  |  CooperDebateTeam.com', align='C', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_font('Helvetica', '', 9)
        self.set_text_color(150, 180, 210)
        self.cell(0, 6, 'Prepared by Hannah Shiv  |  July 2026', align='C', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(0, 0, 0)
        self.ln(34)

    def section_title(self, text):
        self.set_font('Helvetica', 'B', 12)
        self.set_text_color(11, 37, 69)
        self.set_fill_color(232, 238, 250)
        self.cell(0, 9, '  ' + text, fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_draw_color(212, 160, 23)
        y = self.get_y()
        self.set_line_width(0.7)
        self.line(18, y, 192, y)
        self.set_line_width(0.2)
        self.set_draw_color(0, 0, 0)
        self.ln(3)
        self.set_text_color(0, 0, 0)

    def tier_header(self, tier_num, tier_name, description, r, g, b):
        self.set_fill_color(r, g, b)
        self.set_text_color(255, 255, 255)
        self.set_font('Helvetica', 'B', 10)
        self.cell(0, 8, f'  TIER {tier_num}: {tier_name}', fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        nr = min(r + 35, 255)
        ng = min(g + 35, 255)
        nb = min(b + 35, 255)
        self.set_fill_color(nr, ng, nb)
        self.set_font('Helvetica', 'I', 9)
        self.cell(0, 6, '  ' + description, fill=True, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(0, 0, 0)
        self.ln(2)

    def feature_card(self, number, title, bullets, badge='', br=100, bg=100, bb=100):
        self.set_x(18)
        self.set_fill_color(11, 37, 69)
        self.set_font('Helvetica', 'B', 9)
        self.set_text_color(212, 160, 23)
        self.cell(8, 8, str(number), fill=True, align='C')
        self.set_font('Helvetica', 'B', 10.5)
        self.set_text_color(11, 37, 69)
        badge_w = 32 if badge else 0
        self.cell(174 - 8 - badge_w, 8, '  ' + title)
        if badge:
            self.set_fill_color(br, bg, bb)
            self.set_font('Helvetica', 'B', 6.5)
            self.set_text_color(255, 255, 255)
            self.cell(badge_w, 8, badge, fill=True, align='C')
        self.ln(9)
        for bullet in bullets:
            self.set_x(28)
            self.set_font('Helvetica', 'B', 9)
            self.set_text_color(212, 130, 0)
            self.cell(5, 6, '>')
            self.set_font('Helvetica', '', 9)
            self.set_text_color(50, 50, 50)
            self.multi_cell(159, 6, bullet, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(3)
        self.set_text_color(0, 0, 0)

    def callout(self, text, r=255, g=248, b=220, tr=80, tg=50, tb=0, border_r=212, border_g=160, border_b=23):
        self.set_fill_color(r, g, b)
        self.set_draw_color(border_r, border_g, border_b)
        self.set_line_width(0.6)
        self.set_font('Helvetica', 'B', 9.5)
        self.set_text_color(tr, tg, tb)
        self.multi_cell(0, 7, text, fill=True, border=1, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_line_width(0.2)
        self.set_draw_color(0, 0, 0)
        self.set_text_color(0, 0, 0)
        self.ln(3)

    def body(self, text, indent=0):
        self.set_font('Helvetica', '', 9.5)
        self.set_text_color(55, 55, 55)
        self.set_x(18 + indent)
        self.multi_cell(174 - indent, 6, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(0, 0, 0)
        self.ln(1)

    def label_row(self, label, desc, lw=50):
        self.set_x(18)
        self.set_font('Helvetica', 'B', 9.5)
        self.set_text_color(11, 37, 69)
        self.cell(lw, 6, label)
        self.set_font('Helvetica', '', 9.5)
        self.set_text_color(55, 55, 55)
        self.multi_cell(174 - lw, 6, desc, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(0, 0, 0)
        self.ln(1)

    def bullet_item(self, text, color_r=212, color_g=130, color_b=0):
        self.set_x(18)
        self.set_font('Helvetica', 'B', 9.5)
        self.set_text_color(color_r, color_g, color_b)
        self.cell(6, 6, chr(149))
        self.set_font('Helvetica', '', 9.5)
        self.set_text_color(55, 55, 55)
        self.multi_cell(168, 6, text, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.set_text_color(0, 0, 0)


pdf = RoadmapPDF()
pdf.set_title('Cooper Debate Team Website Feature Roadmap')
pdf.set_author('Hannah Shiv')

# ══════════════════════════════════════════
# PAGE 1  -  Cover + Vision + Audiences
# ══════════════════════════════════════════
pdf.add_page()
pdf.cover_block()

pdf.section_title('Vision Statement')
pdf.body(
    'Create a secure, visually stunning debate platform that serves prospective students, '
    'current team members, parents, guardians, coaches, and alumni. Combine interactive '
    'learning, tournament management, resource sharing, and celebration of Cooper Debate\'s '
    'achievements into one cohesive digital experience  -  replacing and expanding upon the '
    'team\'s existing Schoology group.'
)
pdf.ln(2)

pdf.section_title('Primary Audiences')
audiences = [
    ('Prospective Students', '7th and 8th graders considering joining the Cooper Debate Team'),
    ('Parents & Guardians', 'Families who need to understand commitments, logistics, and requirements'),
    ('Current Members',     'Active debaters who need resources, schedules, partner info, and team tools'),
    ('Coaches',             'Ms. Konde and any assistant coaches managing the program'),
    ('Langley Mentors',     'Langley HS students who support Cooper debaters weekly'),
    ('Alumni',              'Former Cooper debaters who went on to high school debate, law, and public service'),
]
for role, desc in audiences:
    pdf.label_row(role, desc, lw=48)

pdf.ln(2)
pdf.callout(
    'CRITICAL SITE-WIDE REQUIREMENT: The new application policy must appear in a minimum of '
    '5 locations across the site. All interested students  -  including returning members  -  must '
    'apply before the deadline. Only Metro Finals qualifiers are automatically on the team. '
    'No surprises. This must be unmissable.'
)

pdf.section_title('Privacy & Access Principles')
pdf.body(
    'Per Coach Konde: individual performance metrics that could embarrass students must never '
    'be publicly visible. Content meant for Cooper students only lives behind the members login. '
    'The site must reflect FCPS guidelines on student data and privacy at all times.'
)

# ══════════════════════════════════════════
# PAGE 2  -  Tier Overview + Tier 1 start
# ══════════════════════════════════════════
pdf.add_page()

pdf.section_title('Feature Tiers at a Glance')
tiers = [
    (1, 'PUBLIC RECRUITMENT & INFORMATION',
     'Publicly visible  -  no login required. Primary audience: prospective students and parents.',
     11, 37, 69),
    (2, 'MEMBERS PORTAL',
     'Login required. Serves current team members, parents, and coaches.',
     25, 105, 60),
    (3, 'INTERACTIVE LEARNING',
     'Educational tools for debate skill-building. Basic content public; deeper content members-only.',
     130, 70, 10),
    (4, 'ADVANCED FEATURES',
     'Ambitious enhancements that elevate this platform well beyond a standard team site.',
     90, 20, 120),
]
for t in tiers:
    pdf.tier_header(*t)
    pdf.ln(1)

pdf.ln(3)
pdf.section_title('TIER 1  -  Public Recruitment & Information')

pdf.feature_card(1, 'Future Debater Journey', [
    'What is debate?  -  plain-language explanation for students and parents new to the activity',
    'Why Join Debate?  -  leadership, critical thinking, confidence, friendships, fun, karaoke',
    'What is Public Forum?  -  format overview, what a resolution is, how rounds are structured',
    'Round structure chart  -  Constructive, Rebuttal, Crossfire, Summary, Final Focus with timings',
    'Weighing, Framework, and Evidence  -  linked explainer pages for each concept',
    'Meet the Team  -  coach bios, Langley mentor section, student spotlights',
], 'COACH #1', 180, 30, 30)

pdf.feature_card(2, 'Join the Team Hub', [
    'NEW APPLICATION POLICY alert  -  prominent, repeated a minimum of 5 times site-wide',
    'Eligibility  -  grades 7 and 8, no prior experience required, open to all beginners',
    'Application access  -  embedded Google Form with confirmation receipt (no disputes)',
    'Selection process  -  info session (late Aug), Activity Fair (early Sept), two tryout dates',
    'Key dates  -  application deadline, tryout dates, first practice, full season calendar',
    'Student commitment overview  -  Tuesdays 2:30-4:30pm; attend 3 of 5 Saturday tournaments',
    'Partner commitment policy  -  no last-minute drops; explained clearly and upfront',
    'Contract / agreement link  -  downloadable PDF once finalized by Coach Konde',
], 'COACH #1', 180, 30, 30)

pdf.feature_card(3, 'Parent & Family Information Center', [
    '$15 per student per year  -  fee waivers available; stated clearly',
    'Required Google Meet sessions  -  one per semester (October and January)',
    'Judge volunteer requirement  -  at least 1 tournament per family; WASDL training provided',
    'Transportation  -  no FCPS bus service; parents drive or organize carpools',
    'Permission slips packet  -  digital where possible; due by October 1st',
    'Tournament day guide  -  arrival time, round count, dress code, pickup time, parent access',
    'Communication channels  -  how coach reaches parents during tournament day',
    'Snack sign-up for team parties',
], 'HIGH', 180, 100, 20)

# ══════════════════════════════════════════
# PAGE 3  -  Tier 1 continued
# ══════════════════════════════════════════
pdf.add_page()
pdf.section_title('TIER 1  -  Continued')

pdf.feature_card(4, 'Tournament Center', [
    'Full season calendar  -  tournament name, host school, date, format, team size attending',
    'WASDL circuit explanation  -  what WASDL is, how the season works, qualification explained',
    'Metro Finals section  -  what it takes to qualify, what it means to compete',
    'MS Nationals section  -  NCFL/NSDA info, Cooper\'s growing history at nationals',
    'Past results table  -  carefully curated (no data that could embarrass individual students)',
    'Tournament day walkthrough  -  what a typical Saturday looks like from arrival to pickup',
], 'HIGH', 180, 100, 20)

pdf.feature_card(5, 'Achievements & Hall of Fame', [
    'Season highlights  -  90 debaters in prelims; 44 to Metro Finals placing 2nd, 3rd, and 4th',
    'Nationals highlight  -  7 Cooper students at NCFL Nationals; 4 teams to Octos; 1 in finals',
    'Student spotlights  -  7th grade team H/J showing anyone can succeed; team L/L win featured',
    'All-time program milestones  -  history, founding year, notable firsts with years',
    'Top Speakers archive  -  speaker award recipients across all seasons',
    'Alumni spotlight  -  former Cooper debaters in college debate, law, and public service',
], 'MEDIUM', 100, 130, 30)

pdf.feature_card(6, 'Langley Mentors Program', [
    'Who they are  -  Langley HS students, many former Cooper debaters, some nationally ranked',
    'How the partnership works  -  weekly visits, skill drills, crossfire practice, topic brainstorming',
    'Featured quote  -  Inger Logan, incoming Langley Debate Team President (cc\'d by coach)',
    'Mentor profiles  -  names, debate background, areas they specialize in helping with',
    'AI Policy page  -  link to WASDL\'s official AI policy with coach\'s context and guidance',
], 'MEDIUM', 100, 130, 30)

pdf.feature_card(7, 'Team Culture & Gallery', [
    'Practice culture  -  Tuesday sessions in the Lecture Hall; what a typical practice looks like',
    'Team traditions  -  end-of-year parties, karaoke, community events, banquet',
    'Photo gallery  -  tournaments, award ceremonies, practice sessions, team events',
    'Video section  -  recorded rounds, highlight reels, embedded YouTube content',
    'Explainer video embed  -  "What is Public Forum Debate?" for newcomers and parents',
    'Photo submission  -  how parents and students can contribute photos with consent info',
], 'MEDIUM', 100, 130, 30)

# ══════════════════════════════════════════
# PAGE 4  -  Tier 2
# ══════════════════════════════════════════
pdf.add_page()
pdf.section_title('TIER 2  -  Members Portal  (Login Required)')
pdf.body(
    'All Tier 2 features require Firebase Authentication. Content is restricted to '
    'Cooper Debate Team members only, consistent with FCPS privacy guidelines. '
    'Students must not be able to share private content outside the team.'
)
pdf.ln(2)

pdf.feature_card(8, 'Secure Evidence Repository', [
    'Case files  -  team cases organized by resolution and topic',
    'Evidence cards  -  sourced research materials for current and past topics',
    'Flow sheets  -  practice flows from internal debates and past tournaments',
    'Private resources  -  any materials the coach marks as Cooper-only',
    'Upload system  -  coach and members can add files; organized by season',
], 'MEMBERS', 25, 105, 60)

pdf.feature_card(9, 'Team Dashboard', [
    'Announcements  -  coach posts updates visible only to logged-in members',
    'Practice schedule  -  Tuesday A and B session details, room assignments',
    'Partner assignments  -  who is paired with whom for each tournament',
    'Assignments  -  research tasks, speech prep deadlines, reading assignments',
    'Tournament readiness  -  confirmation tracker showing who has confirmed for each event',
], 'MEMBERS', 25, 105, 60)

pdf.feature_card(10, 'Full Parent Portal', [
    'Digital permission slips  -  fillable and signable online',
    'Judge signup integration  -  SignUp Genius embed; opens once team roster is finalized',
    'Carpooling coordination  -  tool for parents to organize tournament transportation',
    'Google Meet links  -  for required semester meetings (October and January)',
    'Tournament communication  -  how to reach the coach on tournament day',
    'FAQ library  -  answers to the most common parent questions about the program',
], 'MEMBERS', 25, 105, 60)

pdf.feature_card(11, 'Tournament History Database', [
    'Full historical results  -  every tournament, searchable by year and team',
    'Awards archive  -  all speaker awards and placements across all seasons',
    'Photo albums by year  -  organized gallery for each season',
    'Nationals archive  -  every Cooper qualification with results and photos',
    'NOTE: Individual metrics visible to logged-in members only  -  never on the public site',
], 'MEMBERS', 25, 105, 60)

# ══════════════════════════════════════════
# PAGE 5  -  Tier 3 + Tier 4
# ══════════════════════════════════════════
pdf.add_page()
pdf.section_title('TIER 3  -  Interactive Learning Features')
pdf.body(
    'Educational tools to help students understand debate concepts, master current resolutions, '
    'and build skills. Basic explainer content can be public; quizzes and evidence tools '
    'work best behind member login.'
)
pdf.ln(2)

pdf.feature_card(12, 'PF Academy  -  Debate Education Hub', [
    'Speech types  -  Constructive, Rebuttal, Summary, Final Focus with examples and time limits',
    'Crossfire strategy  -  techniques, common mistakes, how to control the exchange',
    'Weighing guide  -  magnitude, probability, timeframe; how judges evaluate impacts',
    'Framework and evidence  -  how to structure a case; what makes a credible source',
    'Judge tips  -  what judges look for; how to speak clearly; how to flow',
    'Common mistakes  -  top 3 errors new debaters make (per Coach Konde)',
    'Quizzes  -  self-assessment on debate terminology and concepts',
], 'INTERACTIVE', 130, 70, 10)

pdf.feature_card(13, 'Resolution Explorer / Topic Center', [
    'Current resolution  -  exact NSDA wording, posted when released (Aug 1 for Sept/Oct topic)',
    '"Learn a Topic Fast" guide  -  Cooper\'s approach to mastering a new topic in one month',
    'Pro/Con breakdown  -  strongest arguments on each side, curated by coach and members',
    'Vocabulary builder  -  key terms and definitions for each resolution',
    'Evidence and sources  -  links to articles, government reports, academic papers',
    'Past resolutions archive  -  all previous NSDA PF topics with summaries (2024-25, 2025-26)',
    'AI Policy  -  WASDL link plus Coach Konde\'s guidance on responsible AI use in debate prep',
], 'INTERACTIVE', 130, 70, 10)

pdf.feature_card(14, 'Debate Round Simulator', [
    'Animated round timeline  -  visual walkthrough of a complete PF round',
    'Speech sequence  -  who speaks when, for how long, and in what order',
    'Interactive timers  -  practice timer for each speech type (prep time included)',
    'Sample content  -  example constructive speech, rebuttal moves, and final focus',
    'Ideal for prospective students to experience what a round feels like before joining',
], 'INTERACTIVE', 130, 70, 10)

pdf.ln(2)
pdf.section_title('TIER 4  -  Advanced / Future Features')
pdf.body(
    'Ambitious enhancements that would make this platform genuinely exceptional  -  '
    'unlike anything found on a typical middle school team site. Planned for after '
    'the core features are stable and being actively used.'
)
pdf.ln(2)

pdf.feature_card(15, 'Debate Arena  -  Immersive Interactive Experience', [
    'Choose a side  -  student picks affirmative or negative on a live resolution',
    'Build a case interactively  -  guided prompts for contentions, evidence, and impacts',
    'Practice crossfire  -  simulated Q&A with sample opponent questions and responses',
    'Game-like experience for new students to try debate before committing to applying',
    'High potential as a recruitment tool at the Activity Fair in September',
], 'FUTURE', 90, 20, 120)

pdf.feature_card(16, 'Ask a Mentor', [
    'Live or async Q&A connecting Cooper students with Langley mentors',
    'Mentor profiles with listed specialties (crossfire, evidence, specific topics)',
    'Submit a question  -  mentor responds within a set number of days',
    'Requires coordination with Langley Debate Team leadership (Inger Logan)',
    'Could evolve into a structured mentorship matching system over time',
], 'FUTURE', 90, 20, 120)

# ══════════════════════════════════════════
# PAGE 6  -  Content Sources + Outstanding
# ══════════════════════════════════════════
pdf.add_page()
pdf.section_title('Content Sources  -  What We Have')
pdf.body('The following materials are already available or in progress:')
pdf.ln(1)

sources = [
    ("Coach's Email (Jul 13, 2026)",
     "Full content brief from Ms. Konde  -  why join, application policy, student and parent "
     "commitments, coach bio, Langley mentors program, AI policy, season stats, and key dates."),
    ("Google Slides (Coach Konde)",
     "Coach has existing slides with most content already written. Hannah to request and receive "
     "these slides  -  fastest path to populating page content."),
    ("Inger Logan's Debate Manual",
     "Inger (cc'd on coach's email) drafted a debate manual with language directly usable for "
     "the PF Academy, round structure, and terminology pages."),
    ("73-Question Content Brief",
     "Two-part document sent to coach covering all pages. Coach is actively working through "
     "answers. Covers Home, About, Awards, Tournaments, Gallery, Resources, and Blog."),
    ("Feature Roadmap PDF (16 features)",
     "Creative ideas document provided  -  all 16 features incorporated and organized into "
     "this roadmap's four-tier structure."),
    ("Existing Phase 1 Website",
     "Seven public pages already built with the full design system, dome navigation, Cooper "
     "Cougars hero image, and placeholder content ready to swap for real data."),
]
for label, desc in sources:
    pdf.label_row(label, desc, lw=52)

pdf.ln(3)
pdf.section_title('Outstanding  -  Content Needed from Coach Konde')

needed = [
    "Google Slides  -  request resend; most page content already lives in these slides",
    "Exact dates  -  info session, Activity Fair, application deadline, two tryout dates, "
    "Tuesday A and B session schedule for 2026-27",
    "Google Form link  -  updated application form with confirmation receipt",
    "Student contract / agreement  -  draft or final version for the site link",
    "Team L/L result  -  what did L/L win? (for season highlights section)",
    "Student photos  -  with consent documentation for any student shown on the site",
    "Coach headshot  -  for About / Coaches section",
    "Public vs. members-only decision  -  which content is open, which requires login",
    "All-time milestones  -  3 to 6 historic program moments with years",
    "Past resolutions  -  full list for 2024-25 and 2025-26 seasons",
]
for item in needed:
    pdf.bullet_item(item)

pdf.ln(3)
pdf.callout(
    'DESIGN CARRY-FORWARD: The existing visual identity is approved and carries into all new '
    'pages. Navy #0B2545, Gold #D4A017, Cormorant Garamond headings, Josefin Sans body, '
    'dome/radial navigation, Cooper Cougars hero image. No redesign needed.'
)

pdf.section_title('Key Design Decisions Already Made')
decisions = [
    ('Navigation',         'Dome/radial nav  -  Members circle swapped for Home so every page links back'),
    ('Privacy',            'Student metrics never shown publicly; member content behind Firebase login'),
    ('Application Policy', 'Appears minimum 5 times site-wide in alert/banner style  -  unmissable'),
    ('Hosting',            'GitHub Pages static hosting; CooperDebateTeam.com target domain; CNAME configured'),
    ('Phase 2 Auth',       'Firebase Authentication for members portal; members.html is current placeholder'),
    ('Credit',             'Hannah Shiv credited in footer on every page and on the About page coach card'),
]
for label, desc in decisions:
    pdf.label_row(label, desc, lw=40)

pdf.output('Cooper_Debate_Team_Feature_Roadmap.pdf')
print(f'Done  -  6 pages generated')
