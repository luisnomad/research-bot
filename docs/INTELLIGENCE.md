# Intelligence: Semantic Search & Vector Persistence

This document explains the "Intelligence" layer of the Knowledge Base in simple terms.

## 1. What are Semantic Embeddings?

Traditionally, searching for information requires matching exact words. If you search for "automobile", a traditional system might miss a note that only mentions "car".

**Semantic Embeddings** solve this by converting text into a list of numbers (a **Vector**) that represents its *meaning*.

*   **How it works**: We use a local AI model (`nomic-embed-text`) to "read" your note and generate a mathematical representation (768 numbers).
*   **The Magic**: Notes with similar meanings will have numbers that are "close" to each other in mathematical space.
*   **Context**: This allows the system to understand that "LLM context windows" and "token limits" are related topics, even if they don't share the same words.

## 2. What is Vector Persistence?

Generating these embeddings takes time and CPU/GPU power. We don't want to recalculate them every time you want to search.

**Vector Persistence** means we save these lists of numbers directly into our database (`seeds` table) alongside the text.

*   **Storage**: We store the vector as a "BLOB" (Binary Large Object) in SQLite.
*   **Efficiency**: Once saved, we can perform "Semantic Search" or "Topic Clustering" almost instantly by comparing the saved numbers.

## 3. Why does this matter for this project?

By adding these two features, your Knowledge Base stops being just a pile of files and starts being an intelligent graph:

1.  **AI-Powered Search**: You can ask your Telegram bot "What did I save about local AI agents?" and it will find relevant notes even if the word "agent" isn't in every file.
2.  **Automatic Linking**: The system can suggest wikilinks (`[[related-note]]`) by finding other items in your library that have a high "similarity score".
3.  **Discovery**: It helps the AI discover "clusters" of knowledge—topics you are interested in but haven't explicitly categorized yet.

---

**Technical Note**: We use `Float32Array` to represent vectors in memory and store them as raw binary buffers in SQLite for maximum performance and minimum disk space.
