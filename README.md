# oakdata-js

OakData web analytics SDK — a drop-in tracker for browser and Next.js apps.

Captures pageviews, autocaptured clicks, web vitals, errors, sessions, and (optionally) session replay. Same engine as the `<script src="oak.js">` snippet, packaged for modern bundlers.

## Install

```bash
npm install oakdata-js
```

## Next.js (App Router, 15.1+)

Create `instrumentation-client.ts` at your project root:

```ts
import { init } from 'oakdata-js'

init({
  key: process.env.NEXT_PUBLIC_OAK_KEY!,
  host: process.env.NEXT_PUBLIC_OAK_HOST, // optional, defaults to current origin
})
```

Add to `.env.local`:

```bash
NEXT_PUBLIC_OAK_KEY=oak_pub_xxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_OAK_HOST=https://oakdata.co
```

That's it — pageviews + autocapture start immediately.

## Identifying signed-in users

After signin/signup, call `identify` with the user's id and any traits you want to see in the OakData dashboard:

```ts
import { init } from 'oakdata-js'

const oak = init({ key: process.env.NEXT_PUBLIC_OAK_KEY!, host: process.env.NEXT_PUBLIC_OAK_HOST })

oak?.identify(user.id, {
  email: user.email,
  name: user.name,
})
```

On signout, call `oak.reset()` to clear stored ids before the next visitor.

## API

```ts
const oak = init({ key, host })
oak.track('signup_completed', { plan: 'pro' })
oak.identify(userId, { email })
oak.page()
oak.set({ plan: 'enterprise' })
oak.group('company', 'acme-co', { name: 'Acme' })
oak.reset()
```

Full API reference: see [`OakApi` in `src/types.ts`](./src/types.ts).

## Plain HTML (no bundler)

If you don't have a bundler, use the script-tag snippet shown in the OakData dashboard instead.

## License

MIT
