/**
 * AI 响应的纯解析层：不发起网络请求，可离线测试。
 * 网络本身由 `ai.ts` 的 `callChatCompletions` 负责（ticket 06）。
 */

/** 去掉模型爱加的三反引号围栏，容忍 ```json / ```JSON 与多余空白 */
export function stripCodeFence(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

/**
 * 从模型回复中解析 JSON。
 *
 * 依次尝试：去围栏后整体解析 → 围栏内代码块 → 首个数组块 → 首个对象块。
 * 全部失败返回 null，由调用方决定兜底文案，避免异常穿透到 UI。
 */
export function parseAiJson<T = unknown>(raw: string): T | null {
  if (!raw || !raw.trim()) return null;

  const attempts: string[] = [];
  const stripped = stripCodeFence(raw);
  attempts.push(stripped);

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const arrayBlock = stripped.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayBlock?.[0]) attempts.push(arrayBlock[0]);

  const objectBlock = stripped.match(/\{[\s\S]*\}/);
  if (objectBlock?.[0]) attempts.push(objectBlock[0]);

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // 继续尝试下一种切法
    }
  }
  return null;
}

/**
 * 规范化标签：去空白、去前导 #、丢弃空值与超长项、截断到上限。
 * 与分类阶段「标签池优先、数量极简」的约定一致（见 GLOSSARY：标签池）。
 */
export function normalizeTags(input: unknown, maxCount: number): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((t) => String(t).trim().replace(/^#+/, ''))
    .filter((t) => t.length > 0 && t.length <= 15)
    .slice(0, Math.max(0, maxCount));
}

const STATUS_HINTS: Record<number, string> = {
  400: '请求格式被拒绝',
  401: '鉴权失败，请检查 API Key',
  403: '没有访问该模型的权限',
  404: '端点不存在，请检查 Base URL',
  429: '触发限流或额度不足，请稍后再试',
  500: '上游服务内部错误',
  502: '上游网关错误',
  503: '上游服务暂不可用',
  504: '上游响应超时',
};

function looksLikeHtml(text: string): boolean {
  return /^\s*<(!doctype|html|head|body)/i.test(text);
}

/**
 * 把 HTTP 错误响应变成可读文案。
 *
 * 规则：JSON 里的 `error.message` 优先；HTML 错误页与网络类关键词给固定解释；
 * 都没有时按状态码给提示；最后统一截断，避免几百字符的堆栈把 UI 撑爆。
 */
export function mapHttpError(status: number, bodyText: string): string {
  const body = (bodyText || '').trim();

  if (looksLikeHtml(body)) {
    return `服务返回了 HTML 错误页（HTTP ${status}），请检查端点地址是否指向 API`;
  }

  let message = body;
  try {
    const parsed = JSON.parse(body);
    if (parsed?.error?.message) message = String(parsed.error.message);
  } catch {
    // 非 JSON：保留原文
  }

  if (!message.trim()) {
    return STATUS_HINTS[status] || `请求失败（HTTP ${status}）`;
  }

  if (
    message.includes('connectex') ||
    message.includes('dial tcp') ||
    message.includes('timeout') ||
    message.includes('Failed to fetch')
  ) {
    return '网络连接超时（无法连接到上游模型服务，请检查网络/节点代理）';
  }
  if (message.includes('auth_unavailable')) {
    return '上游服务凭据失效或连接中断 (auth_unavailable)';
  }

  const hint = STATUS_HINTS[status];
  if (hint && message.length > 80) {
    return `${hint}：${message.slice(0, 80)}...`;
  }
  return message.length > 80 ? `${message.slice(0, 80)}...` : message;
}
