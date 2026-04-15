# Debugging Rules

- When a bug can't be diagnosed from code alone, ASK the user to run diagnostics (DB queries, API calls, console logs) EARLY — don't keep guessing from source code.
- If you've read the same files twice without finding the root cause, stop and ask the user for runtime data.
- Prefer asking the user to hit an endpoint directly or query the database over speculating about what the data might look like.
- Never go more than two rounds of "let me check another file" without proposing a concrete diagnostic step the user can run.
- When dealing with data-dependent bugs (visibility, permissions, filtering), always ask about the actual data state before making code changes.
