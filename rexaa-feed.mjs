const BASE_URL = 'https://hao.cnyes.com';
const CHANNEL_ID = 444;
const CHANNEL_URL = `${BASE_URL}/ch/${CHANNEL_ID}`;
const API_URL = `${BASE_URL}/h_api/1/pg_ch`;
const MORE_URL = `${BASE_URL}/h_api/1/pg_ch/more`;
const DEFAULT_PAGE_COUNT = 3;

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function stripHtml(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(value, limit = 1200) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 1).trim()}…`;
}

function toRfc2822(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'user-agent': 'Mozilla/5.0 RSS Generator',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data?.payload) {
    throw new Error('Unexpected API response shape');
  }

  return data.payload;
}

async function fetchPage(page) {
  const timezoneOffset = new Date().getTimezoneOffset() * 60 * 1000;

  if (page === 1) {
    return postJson(API_URL, { p2: CHANNEL_ID, timezoneOffset });
  }

  return postJson(MORE_URL, { p2: CHANNEL_ID, p3: page, timezoneOffset });
}

async function fetchItems(pageCount = DEFAULT_PAGE_COUNT) {
  const items = [];
  let hasNextPage = true;

  for (let page = 1; page <= pageCount && hasNextPage; page += 1) {
    const payload = await fetchPage(page);
    const pageData = payload?.Root?.Page_文章;
    const list = pageData?.List_文章 ?? [];
    items.push(...list);
    hasNextPage = Boolean(pageData?.hasNextPage);
  }

  return items
    .filter((item) => item?.文章Id && item?.標題)
    .filter((item, index, array) => array.findIndex((x) => x.文章Id === item.文章Id) === index)
    .sort((a, b) => new Date(b.排序時間 ?? b.CreatedAt ?? 0) - new Date(a.排序時間 ?? a.CreatedAt ?? 0));
}

function renderItem(item) {
  const id = item.文章Id;
  const link = `${BASE_URL}/post/${id}`;
  const title = escapeXml(item.標題);
  const rawDescription = item.RenderedPlain_內容 || item.摘要 || item.內容 || '';
  const description = escapeXml(truncate(stripHtml(rawDescription)));
  const pubDate = toRfc2822(item.排序時間 || item.ModifiedAt || item.CreatedAt);
  const guid = escapeXml(link);
  const author = escapeXml(item?._號?.名稱 || 'RexAA');
  const category = escapeXml(item.__文章類別名稱 || item.文章型態 || '文章');

  return `    <item>
      <title>${title}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${guid}</guid>
      <pubDate>${pubDate}</pubDate>
      <author>${author}</author>
      <category>${category}</category>
      <description>${description}</description>
    </item>`;
}

export async function buildFeed({ pageCount = DEFAULT_PAGE_COUNT } = {}) {
  const items = await fetchItems(pageCount);
  const latestDate = items[0]?.排序時間 || items[0]?.ModifiedAt || items[0]?.CreatedAt || new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>RexAA | 鉅亨號</title>
    <link>${CHANNEL_URL}</link>
    <description>RexAA 在鉅亨號的最新文章，非官方 RSS。</description>
    <language>zh-TW</language>
    <lastBuildDate>${toRfc2822(latestDate)}</lastBuildDate>
    <generator>Custom CNYES RSS bridge</generator>
${items.map(renderItem).join('\n')}
  </channel>
</rss>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pageCount = Number(process.argv[2] || DEFAULT_PAGE_COUNT);
  const xml = await buildFeed({ pageCount });
  process.stdout.write(xml);
}
