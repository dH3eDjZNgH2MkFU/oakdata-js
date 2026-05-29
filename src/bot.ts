// Client-side bot/crawler signal. Substring-matched against the UA string and
// UA Client Hints brands, plus the automation flag. The server runs the
// authoritative classification; this is forwarded as a `$bot` hint so signals
// the request headers can't see (navigator.webdriver, headless markers) still
// count. Kept as a single case-insensitive regex for speed.
const BOT_RE =
  /bot\b|bot\/|\(bot;|crawler|crawling|spider|scraper|headless|phantomjs|slimerjs|cypress|playwright|puppeteer|prerender|lighthouse|pagespeed|gtmetrix|googlebot|google-cloudvertexbot|google favicon|bingbot|bingpreview|yandexbot|baiduspider|duckduckbot|sogou|applebot|petalbot|amazonbot|ahrefs|semrush|mj12bot|dataforseobot|screaming frog|gptbot|oai-searchbot|chatgpt-user|perplexitybot|claudebot|anthropic-ai|ccbot|bytespider|meta-externalagent|facebookexternalhit|whatsapp|telegrambot|slackbot|discordbot|pingdom|uptimerobot|better uptime bot|sentryuptimebot|statuscake|site24x7|vercelbot|vercel-screenshot/i

export function isBot(): boolean {
  try {
    if (navigator.webdriver) return true
  } catch {}

  const ua = navigator.userAgent || ''
  if (BOT_RE.test(ua)) return true

  // UA Client Hints brands — catches some headless/automation cases that spoof
  // or omit the legacy UA string.
  try {
    const brands = navigator.userAgentData?.brands
    if (brands && brands.some((b) => BOT_RE.test(b.brand))) return true
  } catch {}

  return false
}
