export const API_SHAPES = [
  'openai_completions',
  'anthropic_messages',
  'gemini_generate_content',
];

export function detectApiShape(pathname) {
  if (pathname === '/api/openai/v1/chat/completions') {
    return { key: 'openai_completions' };
  }
  if (pathname === '/api/anthropic/v1/messages') {
    return { key: 'anthropic_messages' };
  }

  const geminiRegex = /^\/api\/gemini\/v1beta\/models\/[^/]+\/(generateContent|streamGenerateContent)$/;
  if (geminiRegex.test(pathname)) {
    return { key: 'gemini_generate_content' };
  }

  return null;
}

export function extractMessage(body, apiShape) {
  if (!body || typeof body !== 'object') return '';

  switch (apiShape) {
    case 'openai_completions':
      return extractOpenAIMessage(body);
    case 'anthropic_messages':
      return extractAnthropicMessage(body);
    case 'gemini_generate_content':
      return extractGeminiMessage(body);
    default:
      return '';
  }
}

function extractOpenAIMessage(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === 'user') {
      return extractTextFromContent(msg.content);
    }
  }
  if (typeof body.prompt === 'string') {
    return body.prompt;
  }
  return '';
}

function extractAnthropicMessage(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg?.role === 'user') {
      return extractTextFromContent(msg.content);
    }
  }
  return '';
}

function extractGeminiMessage(body) {
  const contents = Array.isArray(body.contents) ? body.contents : [];
  for (let i = contents.length - 1; i >= 0; i -= 1) {
    const content = contents[i];
    if (content?.role === 'user') {
      return extractTextFromParts(content.parts);
    }
  }
  return '';
}

function extractTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item;
        if (typeof item.text === 'string') return item.text;
        if (typeof item.input_text === 'string') return item.input_text;
        return '';
      })
      .join('');
  }
  if (content && typeof content.text === 'string') {
    return content.text;
  }
  return '';
}

function extractTextFromParts(parts) {
  if (!Array.isArray(parts)) return '';
  return parts
    .map((part) => {
      if (!part) return '';
      if (typeof part.text === 'string') return part.text;
      return '';
    })
    .join('');
}
