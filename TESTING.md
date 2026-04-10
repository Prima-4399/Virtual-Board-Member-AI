# Testing the Contextual RAG (Institutional Memory) Feature

To verify that the feature is working correctly, follow these steps:

## 1. Supabase Setup (Prerequisite)
Since this feature requires a vector database, ensure your Supabase instance has the required schema.
- Open your [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql).
- Copy the contents of `backend/supabase_schema.sql` and run it.
- This will enable `pgvector`, create the `documents` and `document_chunks` tables, and the `match_document_chunks` search function.

## 2. Restart the Backend
Ensure the backend is running and that all new dependencies are loaded.
```powershell
cd backend
npm install
npm run dev
```

## 3. Upload Test Documents
- Go to the **Institutional Memory** section on the dashboard.
- Toggle to the **Archive** tab.
- Upload a PDF or Text file (e.g., a "Q2 2025 Financial Summary" or "Board Minutes Meeting #42").
- Wait for the "Indexing" process to complete.

## 4. Perform Natural Language Queries
- Toggle back to the **Intelligence** tab.
- Enter a query like: 
  - *"What was the key decision regarding offshore expansion?"*
  - *"Summarize the cash flow mentioned in the recent reports."*
- **Success Criteria:**
  - The UI shows a "Consulting Archive..." loading state for `< 2 seconds`.
  - A synthesized answer appears in the main panel.
  - A snippet of the relevant text appears in the "Supporting Context" sidebar.
  - The source document name and relevance score are listed.

## 5. Test Continuous Learning
- Upload a second document that contains related but newer information.
- Query for a comparison.
  - *"Compare the primary risks identified in Document A vs Document B."*
- **Success Criteria**: Claude should correctly cross-reference the indexed chunks from both documents and provide a comparative answer.
