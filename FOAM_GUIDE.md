# How This Foam Knowledge Base Works

## The Foam Way

Foam uses **wikilinks** (`[[note-name]]`) to connect notes. That's it. No hierarchy required.

When you write `[[llm-context-management]]`, Foam:
1. Makes it clickable (Ctrl+Click to navigate)
2. Shows backlinks (what notes link TO this one)
3. Updates the graph visualization
4. Helps you discover connections

## Example: How Notes Connect

```
sources/example-ai-agents-article.md
  ↓ mentions
topics/llm-context-management.md
  ↓ appears in
syntheses/weekly-2026-01-13.md
  ↓ inspired
drafts/linkedin-agent-production.md
```

## Your AI System's Job

1. **Process bookmarked content** → Create files in `sources/`
2. **Discover patterns** → Create/update files in `topics/`
3. **Weekly synthesis** → Create files in `syntheses/`
4. **Generate content** → Create files in `drafts/`

## Key Foam Features You'll Use

### 1. Graph View
Press `Ctrl+Shift+P` → "Foam: Show Graph"

See all your notes and how they connect. Watch clusters form organically.

### 2. Backlinks
At the bottom of any note, see "Referenced by" - shows what notes link to it.

### 3. Daily Notes
`Ctrl+Shift+P` → "Foam: Open Daily Note"

Good for: "Today I'm thinking about X" journal entries.

### 4. Tag Explorer
Click any `#tag` to see all notes with that tag.

## Markdown Frontmatter (Optional)

```yaml
---
created: 2026-01-13
tags: [ai, agents, production]
status: processed
---
```

This is just metadata. Foam doesn't require it, but it helps your AI system track things.

## VS Code Extensions You'll Want

1. **Foam** - The core extension
2. **Markdown All in One** - Better markdown editing
3. **Code Spell Checker** - Catch typos

Install with: `code --install-extension foam.foam-vscode`

## Git Integration

Every change is tracked:
```bash
git log --oneline
git diff HEAD~1 README.md
```

Perfect for seeing how your knowledge evolved.

## The Beauty of Foam

**It's just markdown files in folders.**

- Open in any text editor
- Search with `grep`
- Version with Git
- Process with Python
- View in GitHub
- Backup anywhere

No vendor lock-in. No database. No complex setup.

Your AI system writes markdown → Foam makes it navigable → You discover insights.

## Quick Reference

| Action | VS Code Command |
|--------|----------------|
| Show graph | `Ctrl+Shift+P` → "Foam: Show Graph" |
| Create note | `Ctrl+Shift+P` → "Foam: Create New Note" |
| Daily note | `Ctrl+Shift+P` → "Foam: Open Daily Note" |
| Navigate link | `Ctrl+Click` on [[link]] |
| Follow backlink | Click in "Referenced by" panel |

## Example AI-Generated Note

```markdown
---
source: x-bookmarks-12345
processed: 2026-01-13
---

# Article Title

## Summary
[AI-generated summary]

## Key Points
- Point 1
- Point 2

## Related
- [[topic-1]]
- [[topic-2]]

## Actions
- [ ] Test idea X
- [ ] Write about Y
```

Simple. Effective. Scalable.

---

Now go install Foam in VS Code and explore!
