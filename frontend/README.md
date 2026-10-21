This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Backend and persistence

- `NEXT_PUBLIC_BACKEND_URL` picks the backend (default `http://localhost:8080`;
  production is `https://sic-xe-engine.onrender.com`). It is inlined at build
  time, so set it before `npm run build`. The simulator WebSocket is derived
  from it (`ws(s)://<host>/ws`).
- Projects live in the browser (`localStorage`) and are mirrored to the
  session-scoped HTTP API in `../api_spec/openapi.yaml`
  (`src/lib/api`, `src/lib/projects`). The session id is kept in the
  `sicxe_session` cookie.
- Execution (`step`, `reset`, `load %file`) and the detailed architecture
  description (`load $project`) stay on the WebSocket, which the OpenAPI
  document does not cover.
- `npm test` includes a contract test that runs the HTTP client against the
  OpenAPI document. `npm run api:generate` (optional) writes an orval client
  to the git-ignored `src/api/generated` for reference.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
