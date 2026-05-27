# oakdata-js

OakData web analytics SDK — a drop-in tracker for browser and Next.js apps.

Captures pageviews, autocaptured clicks, web vitals, errors, sessions, and (optionally) session replay.

## Install

```bash
npm install oakdata-js
```

## Next.js (App Router, 15.1+)

Create `instrumentation-client.ts` at your project root:

```ts
import oak from 'oakdata-js'

oak.init(process.env.NEXT_PUBLIC_OAK_KEY!, {
  api_host: process.env.NEXT_PUBLIC_OAK_HOST,
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
import oak from 'oakdata-js'

oak.identify(user.id, {
  email: user.email,
  name: user.name,
})
```

Calls made before `init()` are queued and replayed once the tracker comes up, so it's safe to call `oak.identify` from anywhere without worrying about boot ordering. On signout, call `oak.reset()` to clear stored ids.

## API

```ts
import oak from 'oakdata-js'

oak.init(key, options)                  // boot the tracker (once)
oak.capture('signup_completed', { plan: 'pro' })
oak.identify(userId, { email })
oak.page()
oak.set({ plan: 'enterprise' })
oak.group('company', 'acme-co', { name: 'Acme' })
oak.reset()
oak.flush()
oak.getDistinctId()
oak.getSessionId()
```

### `oak.init(key, options)`

| Option              | Type                       | Default                           |
| ------------------- | -------------------------- | --------------------------------- |
| `api_host`          | `string`                   | current origin                    |
| `autocapture`       | `boolean`                  | `true`                            |
| `capture_pageview`  | `boolean`                  | `true`                            |
| `respect_dnt`       | `boolean`                  | `false`                           |
| `debug`             | `boolean`                  | `false`                           |
| `loaded`            | `(oak: OakApi) => void`    | —                                 |

## Plain HTML (no bundler)

If you don't have a bundler, use the script-tag snippet shown in the OakData dashboard instead.

## License

MIT
