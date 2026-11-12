# Project Development Guidelines

## Architecture
- Maintain strict separation between frontend and backend responsibilities.
- Frontend components must not directly access backend database implementations.
- Backend modules must not import frontend components or presentation logic.
- All communication between frontend and backend must follow the established API contracts.
- Only genuinely reusable types, validation schemas, and constants should be placed in shared modules.

## Development
- Inspect existing implementations before creating replacements.
- Preserve existing functionality unless a change is explicitly requested.
- Avoid unnecessary dependencies and duplicate implementations.
- Do not introduce a new framework or architectural pattern without justification.
- Update all affected imports, references, and configurations when moving files.
- Keep environment-specific configuration outside source code.

## AI Agent Responsibilities
- Explain significant architectural decisions.
- Identify assumptions and potential breaking changes.
- Work incrementally instead of performing massive unrelated refactors.
- Run relevant tests and build commands after modifications.
- Report which checks passed, failed, or could not be performed.
- Never commit, push, or merge changes without explicit approval.
