# ⚙️ HDB Quality Assistant Bot — Setup & Configuration

This module handles:
1. Dynamic API key configuration saved directly to Firestore.
2. Auto-detection of ANSI Windows-1256 encoding for Arabic CSV files.
3. Smart RAG search with lexical/fuzzy matching and full-document context fallback.

## Setup Instructions

1. Retrieve a Gemini API Key from Google AI Studio.
2. Open the Admin Dashboard, navigate to the **Knowledge Bot** tab, and input the key in the settings panel.
3. Upload PDF or Excel files. The system will automatically parse and cache them.
