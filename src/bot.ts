export function isBot(): boolean {
  if (navigator.webdriver) return true
  const ua = navigator.userAgent || ''
  return /bot|crawler|spider|crawling|headless|phantomjs|slimerjs|googlebot|bingbot|yandexbot|baiduspider|duckduckbot|sogou|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|semrush|ahrefs|facebookexternalhit|whatsapp|telegrambot|slackbot|discordbot/i.test(ua)
}
