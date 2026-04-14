# POC Brief - AI-Powered Board Management Platform  
Inspired by OnBoard AI and Diligent Boards | Internal Engineering Brief | March 28, 2026  

---

## 1. POC Overview

This POC demonstrates an AI-powered board management platform - a secure workspace where board administrators and directors prepare for, run, and follow up on board meetings. It is modeled after the core workflows of OnBoard AI and Diligent Boards.

The goal is a demo-ready prototype that shows how AI reduces board prep time and helps directors walk into meetings informed and ready to make decisions.

**Core value to demonstrate:**  
A board administrator uploads a meeting pack and, within seconds, gets an AI-generated summary, risk flags, and director talking points - all without leaving the platform.

- **Format:** Interactive React app (in-browser demo)  
- **Estimated build time:** 3–5 engineering days  

---

## 2. Target User & Scenario

### End Users

- **Admin:** Board Administrator (primary demo driver)  
  - Prepares meeting materials  
  - Builds board books  
  - Distributes documents to directors  

- **Director:** Board Director (secondary viewer)  
  - Receives materials  
  - Reads AI-summarized briefings  
  - Annotates documents  
  - Queries the AI assistant  

### Demo Scenario

Meridian Capital Partners, a mid-sized private equity firm, is preparing for its Q2 Board of Directors meeting.

The board administrator:
- Uploads the quarterly financial report  
- Uploads CEO update memo  
- Uploads risk committee report  

The AI assistant:
- Generates a meeting agenda  
- Summarizes each document  
- Flags two risk items for discussion  
- Prepares director talking points  

A board director:
- Logs in  
- Reviews their brief  
- Asks the AI a follow-up question about Q2 cash flow before the meeting starts  

### Success Criteria

The POC is successful if a prospective client:

- Immediately understands how the platform reduces board prep time  
- Sees the AI assistant answer a real governance question from uploaded documents  
- Believes the UI is polished enough to present to their board  
- Asks *"when can we get access?"* before the meeting ends  

---

## 3. Screens & Features to Build

Five screens, all navigable. Priority screens are marked with ★.

### ★ Dashboard (Home)

**Purpose:**  
Personalized landing page showing upcoming meetings, recent activity, and quick actions  

**UI Components:**
- Meeting cards  
- Status badges  
- Upcoming agenda list  
- Action items widget  
- AI insight strip  

**Interactions:**
- Click into a meeting  
- Open AI assistant  
- Navigate to board book  

---

### ★ Meeting Room / Board Book

**Purpose:**  
Central meeting view - agenda, attached documents, and AI-generated summary panel  

**UI Components:**
- Agenda list  
- Document viewer  
- AI summary sidebar  
- Section tabs  

**Interactions:**
- Expand agenda items  
- View attached docs  
- Toggle AI panel  
- Annotate (highlight)  

---

### ★ AI Assistant (Chat)

**Purpose:**  
Conversational AI that answers questions about board materials with cited responses  

**UI Components:**
- Chat interface  
- Message history  
- Source citation chips  
- Suggested prompt chips  

**Interactions:**
- Type or click suggested questions  
- Receive cited answers  
- Copy response  

---

### Document Library

**Purpose:**  
Secure repository of all board materials organized by meeting and category  

**UI Components:**
- File list with metadata  
- Upload button  
- Category filter  
- Search bar  

**Interactions:**
- Upload doc (mock)  
- Filter by type  
- Click to preview  

---

### Minutes & Actions

**Purpose:**  
Post-meeting view showing AI-drafted minutes and assigned action items  

**UI Components:**
- Draft minutes text block  
- Action item table (owner + due date)  
- Approve/edit buttons  

**Interactions:**
- Review draft  
- Edit inline (mock)  
- Mark action complete  

---

## 4. Dummy Data Requirements

All data should be fictional but domain-specific and believable for a private equity board context.

### Organization

- **Name:** Meridian Capital Partners  
- **Board size:** 7 directors  
- **Meeting:** Q2 Board of Directors Meeting  
  - Date: July 15, 2025  
  - Format: Hybrid - NYC HQ + Zoom  

---

### Board Members

Each needs: Full Name, Title/Company, Role, Attendance Status, Avatar initial.

- Sarah Okonkwo - Managing Partner, Meridian Capital (Chair)  
- James R. Thornton - Former CFO, Apex Industries (Audit Committee Chair)  
- Dr. Lena Vasquez - Professor, Harvard Business School (Independent)  
- Michael Chen - Partner, Meridian Capital (Executive Director)  
- Patricia Hollis - General Counsel, Hollis Legal Group (Independent)  

---

### Meeting Agenda

Each item needs: number, title, presenter, duration, type, status.

1. Call to Order & Quorum - Chair, 5 min, Procedural  
2. Approval of Q1 Minutes - Chair, 5 min, Approval  
3. CEO Strategic Update - CEO, 20 min, Report  
4. Q2 Financial Performance Review - CFO, 30 min, Discussion  
5. Risk Committee Report - Risk Chair, 15 min, Report  
6. Portfolio Company Updates - Managing Partner, 20 min, Information  
7. New Business & Adjournment - Chair, 10 min, Discussion  

---

### AI Assistant - Canned Responses

Minimum 4 predefined Q&A (hardcoded unless using Anthropic API):

- **Q:** "What are the top risks flagged this quarter?"  
  **A:** 3 risks cited from the Risk Committee Report with page references  

- **Q:** "Summarize Q2 financial performance"  
  **A:** Revenue, EBITDA, and cash flow summary with source citation  

- **Q:** "What decisions require board approval today?"  
  **A:** List of 2 approval items with context  

- **Q:** "Generate talking points for the CEO update"  
  **A:** 4 bullet talking points with suggested follow-up questions  

---

### Documents

- Q2 Financial Report - Meridian Capital Partners (12 pages, lorem ipsum PDF)  
- CEO Strategic Update Memo (4 pages)  
- Risk & Compliance Committee Report (6 pages)  

---

### Action Items

5 action items, each with:

- Description  
- Owner (director name)  
- Due date  
- Status (Open / In Progress / Complete)  
- Priority (High / Medium / Low)  

---

## 5. Scope & Constraints

### In Scope

- Interactive React SPA with 5 navigable screens  
- AI assistant with 4+ hardcoded Q&A responses  
- (Optional) Anthropic API integration  
- Dummy data:
  - 1 org  
  - 7 board members  
  - 7 agenda items  
  - 3 documents  
  - 5 action items  
- Document viewer panel (iframe or PDF.js)  
- Desktop layout (1280px+)  

---

### Out of Scope

- No real authentication (mock "logged in as Sarah Okonkwo")  
- No backend or database  
- No file storage  
- No real document upload processing  
- No email/notifications  
- No mobile layout  

---

### Recommended Tech Stack

- **Framework:** React (JSX artifact or Vite app)  
- **Styling:** Tailwind CSS  
- **Icons:** Lucide React  
- **Charts:** Recharts  
- **AI (optional):** Anthropic API (`claude-sonnet-4-20250514`, `/v1/messages`)  
- **PDF Viewing:** PDF.js or iframe  
- **State:** React useState / useContext  

---

## 6. Open Questions & Assumptions

### Assumptions

- Built as React artifact or standalone app  
- AI assistant uses canned responses unless API is integrated  
- "Meridian Capital Partners" is acceptable as fictional brand  
- Placeholder PDFs are acceptable  
- Demo is screen-shared by sales/product team  

---

### Decisions for the Engineer

- **Live AI vs Canned Responses:**  
  - Live AI (Anthropic API) → more impressive, adds latency  
  - Canned → faster to ship  

- **PDF Handling:**  
  - iframe with public PDFs  
  - or locally generated synthetic PDFs  

- **Artifact vs Standalone App:**  
  - React artifact → easier sharing  
  - Vite/Next.js → easier scaling  

- **Brand Customization:**  
  - Should UI support easy swapping of client name, colors, and logo for demos?  

---