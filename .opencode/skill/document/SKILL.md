---
name: document
description: |
  Document canvas for displaying and editing markdown content. Use when showing documents, emails, or when users need to view formatted text.
---

# Document Canvas

Display markdown documents with syntax highlighting and optional text selection.

## Example Prompts

- "Draft an email to the marketing team about the Q1 product launch"
- "Help me edit this blog post - show it so I can review"
- "Write a project proposal and let me see it"
- "Show me the README so I can review sections"
- "Compose a response to this customer complaint"

## Scenarios

### `display` (default)
Read-only document view with markdown rendering.

```typescript
canvas_document({
  content: "# Hello World\n\nThis is **markdown** content.",
  title: "My Document",
  scenario: "display"
})
```

### `edit`
Interactive document view with text selection support.

- Renders markdown with syntax highlighting
- Click and drag to select text
- Selection reported via IPC

```typescript
canvas_document({
  content: "# My Blog Post\n\nThis is the **introduction** to my post.\n\n## Section One\n\n- Point one\n- Point two",
  title: "Blog Post Draft",
  scenario: "edit"
})
```

### `email-preview`
Specialized view for email content display.

```typescript
canvas_document({
  content: "Dear Team,\n\nPlease review the attached document.\n\nBest regards,\nAlice",
  title: "RE: Project Update",
  scenario: "email-preview"
})
```

## Tool Parameters

```typescript
canvas_document({
  content: string,      // Required: Markdown content to display
  title?: string,       // Optional: Document title (shown in header)
  scenario?: string     // Optional: "display" | "edit" | "email-preview"
})
```

## Markdown Support

The document canvas renders these markdown features:

- **Headers** - `# H1`, `## H2`, `### H3`, etc.
- **Bold** - `**text**`
- **Italic** - `*text*`
- **Code** - Inline `` `code` `` and fenced code blocks
- **Links** - `[text](url)`
- **Lists** - Unordered (`-`, `*`) and ordered (`1.`)
- **Blockquotes** - `> quoted text`
- **Horizontal rules** - `---`

## Keyboard Controls

- Arrow keys or scroll: Navigate document
- `q` or `Esc`: Close canvas

## Use Cases

### Drafting Emails
```typescript
canvas_document({
  content: `Hi Team,

Just a quick update on the project status:

**Completed:**
- Feature A implementation
- Bug fixes for module B

**In Progress:**
- Performance optimization
- Documentation updates

Let me know if you have questions!

Best,
Claude`,
  title: "Project Update Email",
  scenario: "email-preview"
})
```

### Showing Code Documentation
```typescript
canvas_document({
  content: `# API Reference

## \`getUserById(id: string)\`

Fetches a user by their unique identifier.

\`\`\`typescript
const user = await getUserById("usr_123");
console.log(user.name);
\`\`\`

### Parameters
- \`id\` - The user's unique identifier

### Returns
A \`User\` object or \`null\` if not found.`,
  title: "API Docs",
  scenario: "display"
})
```

### Interactive Editing
When using the `edit` scenario, users can select text they want to modify. The selection is available via IPC for tools that need to know what the user highlighted.
