import { describe, expect, it } from "vitest";
import { googleNewsUrl, parseRss, tidy } from "./news";

const XML = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>"Brøndby" - Google News</title>
<item><title>Brøndby henter ny back &amp; klar til derby - Tipsbladet</title><link>https://news.google.com/rss/articles/abc</link><pubDate>Sat, 03 Oct 2026 12:00:00 GMT</pubDate><description>&lt;a href="x"&gt;x&lt;/a&gt;</description><source url="https://www.tipsbladet.dk">Tipsbladet</source></item>
<item><title><![CDATA[Skade i FCK før kampen - DR]]></title><link>https://news.google.com/rss/articles/def</link><pubDate>Fri, 02 Oct 2026 08:00:00 GMT</pubDate></item>
<item><title>Gammel nyhed - Bold</title><link>https://news.google.com/rss/articles/old</link><pubDate>Mon, 01 Sep 2026 08:00:00 GMT</pubDate></item>
<item><title>Brøndby henter ny back &amp; klar til derby - Ekstra Bladet</title><link>https://news.google.com/rss/articles/dup</link><pubDate>Sat, 03 Oct 2026 11:00:00 GMT</pubDate><source url="https://ekstrabladet.dk">Ekstra Bladet</source></item>
</channel></rss>`;

describe("football news", () => {
  it("parses Google News RSS and splits off the publisher", () => {
    const items = parseRss(XML);
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ title: "Brøndby henter ny back & klar til derby", link: "https://news.google.com/rss/articles/abc", publisher: "Tipsbladet", published: Date.parse("2026-10-03T12:00:00Z") });
    expect(items[1]).toMatchObject({ title: "Skade i FCK før kampen", publisher: "DR" });
  });

  it("keeps the last week, newest first, one per headline", () => {
    const now = Date.parse("2026-10-03T15:00:00Z");
    expect(tidy(parseRss(XML), now, 10).map((i) => i.publisher)).toEqual(["Tipsbladet", "DR"]);
  });

  it("builds Danish and English search URLs", () => {
    expect(googleNewsUrl('"Brøndby"', "da")).toContain("hl=da&gl=DK&ceid=DK%3Ada");
    expect(googleNewsUrl("x", "en")).toContain("hl=en-GB");
  });
});
