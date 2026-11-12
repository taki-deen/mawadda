# Contributor instructions

Read README.md and PROJECT.md first. Communicate with the owner in Arabic unless requested otherwise.
This is a static prototype, not an authenticated backend application.
Preserve all 150 questions, Arabic RTL behavior, accessible labels, mobile layouts and existing imports.
Use `npm test` and `npm run check` after relevant changes. Dev server: `npm run dev` on loopback port 3000.
No external packages are needed for the baseline. The development server is not a production backend.
Treat imported text and JSON as untrusted. Escape rendered content and validate the schema.
Never store secrets, actual questionnaire answers, or exported personal reports in Git.
Keep incomplete and deferred answers out of the scoring denominator. Open-text answers require joint/manual evaluation.
Keep the non-clinical score explanation and sample size visible.
Do not automatically implement the proposed roadmap or publish changes merely because it is documented. Follow the user's current task scope.
For a future backend, enforce ownership and sharing consent on the server; hiding UI is not authorization.
