# Journey Care

Journey Care is a car maintenance log for households and shared vehicles. It tracks service visits, mileage, upcoming maintenance, spare parts, and spending.

## Run locally

Use Node.js 22 or 24. In PowerShell, run the following from this directory.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
```

Run the copy command only on first setup. Fill in `.env.local` with the Firebase web app settings for your project. Keep local environment files and service-account keys out of Git.

```powershell
npm.cmd run dev
```

Open the local URL printed by Vite.

## Verify and build

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run test:rules
npm.cmd run build
```

The Firestore emulator tests require Java. The production build goes into `dist/`.

## Deploy

Sign in with `npx.cmd firebase login`. Check that the production build succeeded and that `dist/index.html` exists. Review any changes to Firestore rules before publishing them.

```powershell
npx.cmd firebase deploy --only firestore:rules --project car-log-project
npx.cmd firebase deploy --only hosting --project car-log-project
```

Verify sign-in, mileage updates, and a service save in the live app after deployment.

## Project notes

- [Family onboarding](docs/onboarding.md)
- [Google sign-in behavior](docs/auth-redirect.md)
- [Project specifications](specs/CONTEXT.md)
