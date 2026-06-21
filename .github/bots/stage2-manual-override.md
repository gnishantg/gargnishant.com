# Stage 2 Manual Override Guide (Validator)

This runbook explains how to manually override selected Bot 3 output fields in Stage 2 validation.

This file is an operations guide. It does not change workflow behavior by itself.

## Stage 2 Context

Current pipeline stages in workflow:
- `bot2_from_bot1_comment`
- `bot3_refine_and_validate`
- `validate_bot3_override`

Stage 2 override is intended for the validator step after Bot 3 output exists.

## Override Marker and Payload

Use the marker below in an issue comment, followed by JSON payload:

```markdown
<!-- bot3-manual-overrides -->
```json
{
  "seo": {
    "seoTitle": "Guide: How to Improve GitHub Copilot prompts"
  }
}
```
```

## Allowed Override Fields

Only these paths are allowed:
- `seo.seoTitle`
- `seo.metaDescription`
- `seo.tags`
- `seo.primaryKeyword`
- `seo.secondaryKeywords`
- `seo.canonicalUrl`
- `draft.title`

Any field outside this whitelist must be rejected by validator.

## Field-by-Field Comment Examples

### Override `seo.seoTitle`

```markdown
<!-- bot3-manual-overrides -->
```json
{
  "seo": {
    "seoTitle": "Guide: How to Improve GitHub Copilot prompts"
  }
}
```
```

### Override `seo.metaDescription`

```markdown
<!-- bot3-manual-overrides -->
```json
{
  "seo": {
    "metaDescription": "Using structured GitHub Copilot prompts improves output quality, reduces rework, and creates a reliable development workflow for day-to-day tasks."
  }
}
```
```

### Override `seo.tags`

```markdown
<!-- bot3-manual-overrides -->
```json
{
  "seo": {
    "tags": [
      "github-copilot",
      "prompt-engineering",
      "developer-productivity",
      "software-engineering",
      "automation"
    ]
  }
}
```
```

### Override `seo.primaryKeyword`

```markdown
<!-- bot3-manual-overrides -->
```json
{
  "seo": {
    "primaryKeyword": "github copilot prompts"
  }
}
```
```

### Override `seo.secondaryKeywords`

```markdown
<!-- bot3-manual-overrides -->
```json
{
  "seo": {
    "secondaryKeywords": [
      "github copilot prompts guide",
      "github copilot prompts best practices",
      "github copilot prompts workflow"
    ]
  }
}
```
```

### Override `seo.canonicalUrl`

```markdown
<!-- bot3-manual-overrides -->
```json
{
  "seo": {
    "canonicalUrl": "https://gargnishant.com/blogs/how-to-improve-github-copilot-prompts/"
  }
}
```
```

### Override `draft.title`

```markdown
<!-- bot3-manual-overrides -->
```json
{
  "draft": {
    "title": "How to Improve GitHub Copilot prompts"
  }
}
```
```

## Validation Outcomes

- `READY for QA`:
  - No blockers remain after auto-fixes and manual overrides.
- `BLOCKED`:
  - Required fields are missing, canonical is invalid, or disallowed override fields were provided.

Validator may auto-fix safe patterns such as:
- `seoTitle` trailing punctuation or over-length truncation cleanup.
- `metaDescription` anti-patterns like `use using`.

## Troubleshooting

- Marker missing:
  - Ensure comment contains exactly `<!-- bot3-manual-overrides -->`.
- Invalid JSON:
  - Use strict JSON with double quotes and no trailing commas.
- Disallowed fields:
  - Keep payload to the allowed paths only.
- Still blocked:
  - Review blocker list from validator comment and update override payload.

## Notes

- Manual override is preferred for QA wording refinements.
- Bot 3 re-run should be used only when output is broadly unusable.
