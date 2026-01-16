---
source: x-bookmarks
source_id: '1899104347532738764'
author: '@PrajwalTomar_'
url: 'https://x.com/PrajwalTomar_/status/1899104347532738764'
created: '2026-01-14'
triaged: '2026-01-16'
status: approved
confidence: 0.95
is_thread: true
has_images: true
---
# How to Set Up Cursor the Right Way

Cursor Rules are outdated. Project Rules is

### Part 1

How to Set Up Cursor the Right Way

Cursor Rules are outdated. Project Rules is the correct way now. Here’s why it matters and how to set it up properly:

---

### Part 2

1. Why .cursorrules Wasn’t Enough

Cursor originally used a single .cursorrules file at the root of a project, but this approach had serious problems:

Limited control
A single rules file applied to the entire project, even when irrelevant.

Context overload
Cursor’s AI had to

---

### Part 3

2. Introducing Cursor’s Project Rules (.mdc files)

Cursor solved these issues by introducing Project Rules, stored as modular .mdc files inside .cursor/rules/.

This allows for precise rule application per file type, module, or feature instead of one massive, overloaded rules

---

### Part 4

3. Step-by-Step Example: Setting Up Project Rules

Here’s how to set up Project Rules effectively for a cleaner, more efficient AI-powered development workflow.

Step 1: General Rules (general.mdc)

This rule applies to all files across the project.
File: general.mdc
Scope: *

---

### Part 5

Step 2: Frontend Rules (frontend.mdc)

These rules apply only to frontend files (.tsx).
File: frontend.mdc
Scope: *.tsx (React components)

Contents:
- Use functional React components instead of class components.
- Apply Tailwind CSS for styling; avoid inline styles.
- Components

---

### Part 6

Step 3: Backend Rules (backend.mdc)

These rules apply only to backend logic (.ts API and database files).
File: backend.mdc
Scope: api/**/*.ts (all backend API files)

Contents:
- Always validate API inputs before processing requests.
- Use async/await consistently; avoid

---

### Part 7

4. How Project Rules Improved My Agency’s Code Quality

Switching to Project Rules had an immediate impact on our workflow.

Fewer AI mistakes
Cursor follows specific, scoped rules, reducing incorrect suggestions.

No more repetitive corrections
AI now remembers the coding

---

### Part 8

5. Best Practices for Structuring Project Rules

To make the most of Project Rules, follow these best practices:

Keep rules modular and specific
- Separate frontend, backend, and database rules instead of using one large file.

Use precise scope targeting
- *.tsx → Apply only

---

### Part 9

6. Final Takeaway: Project Rules Are a Game-Changer

Cursor’s Project Rules provide a massive improvement over .cursorrules:

- AI-generated code is more accurate and follows best practices.
- Rules are easier to manage, update, and scale across projects.
- Less time spent fixing

## Triage Notes

**Decision**: Approved  
**Confidence**: 95%  
**Reason**: The content is insightful and provides valuable information on setting up cursor rules effectively.


## Related Notes

- [[unwind_ai_-woah-google-just-dropped-the-notebooklm-for-code]] (69% match)
- [[aaditsh-this-guy-literally-dropped-15-rules-to-master-vibe-coding]] (68% match)
- [[mervinpraison-i-think-i-finally-found-the-sweet-spot-for-long-running-ai]] (67% match)
- [[mdancho84-this-guy-built-an-entire-ai-data-science-team-in-python]] (63% match)
- [[bcherny-we-just-open-sourced-the-code-simplifier-agent-we-use-on]] (62% match)
