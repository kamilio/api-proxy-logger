const SHAPES = [
  {
    id: 'completions',
    label: 'OpenAI Chat Completions',
    match: ({ pathname }) =>
      pathname.includes('/chat/completions') || pathname.endsWith('/completions'),
    normalize: normalizeCompletions,
  },
  {
    id: 'responses',
    label: 'OpenAI Responses',
    match: ({ pathname }) => pathname.includes('/responses'),
    normalize: normalizeResponses,
  },
  {
    id: 'anthropic',
    label: 'Anthropic Messages',
    match: ({ pathname }) => pathname.includes('/messages') || pathname.includes('/complete'),
    normalize: normalizeAnthropic,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    match: ({ pathname }) =>
      pathname.includes('generatecontent') ||
      pathname.includes('streamgeneratecontent') ||
      pathname.includes(':generatecontent') ||
      pathname.includes(':streamgeneratecontent'),
    normalize: normalizeGemini,
  },
];

const FALLBACK_SHAPE = {
  id: 'other',
  label: 'Other',
  match: () => true,
  normalize: normalizeOther,
};

export function buildPreviewModel(log) {
  const errors = [];
  const urlInfo = parseUrlInfo(log?.request?.url);
  const shape = resolveShape(urlInfo);

  let normalized;
  try {
    normalized = shape.normalize(log, urlInfo, errors);
  } catch (error) {
    errors.push(`Failed to normalize ${shape.id}: ${error.message}`);
    try {
      normalized = FALLBACK_SHAPE.normalize(log, urlInfo, errors);
    } catch (fallbackError) {
      errors.push(`Fallback normalize failed: ${fallbackError.message}`);
      normalized = { request: emptyPreviewSection(), response: emptyPreviewSection(), spec: emptySpec() };
    }
  }

  return {
    shapeId: shape.id,
    shapeLabel: shape.label,
    request: normalized.request || emptyPreviewSection(),
    response: normalized.response || emptyPreviewSection(),
    spec: normalized.spec || emptySpec(),
    errors,
  };
}

export function getRequestMessageCount(log) {
  const urlInfo = parseUrlInfo(log?.request?.url);
  const shape = resolveShape(urlInfo);
  if (shape.id === 'other') return null;

  try {
    const requestMessages = normalizeRequestMessages(shape.id, log);
    if (!Array.isArray(requestMessages)) return null;
    return requestMessages.length;
  } catch {
    return null;
  }
}

function parseUrlInfo(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { raw: '', pathname: '', hostname: '' };
  }
  try {
    const base = rawUrl.startsWith('http') ? undefined : 'http://proxy.local';
    const url = new URL(rawUrl, base);
    return {
      raw: rawUrl,
      pathname: String(url.pathname || '').toLowerCase(),
      hostname: String(url.hostname || '').toLowerCase(),
    };
  } catch {
    return { raw: rawUrl, pathname: String(rawUrl).toLowerCase(), hostname: '' };
  }
}

function resolveShape(urlInfo) {
  return SHAPES.find((candidate) => candidate.match(urlInfo)) || FALLBACK_SHAPE;
}

function normalizeCompletions(log, urlInfo, errors) {
  const requestBody = asObject(log?.request?.body);
  const responseBody = log?.response?.body;

  const requestMessages = normalizeOpenAIChatMessages(requestBody.messages);
  if (requestMessages.length === 0 && typeof requestBody.prompt === 'string') {
    requestMessages.push({
      role: 'user',
      name: null,
      parts: [{ type: 'text', text: requestBody.prompt }],
      metadata: {},
    });
  } else if (requestMessages.length === 0 && Array.isArray(requestBody.prompt)) {
    for (const prompt of requestBody.prompt) {
      if (typeof prompt === 'string') {
        requestMessages.push({
          role: 'user',
          name: null,
          parts: [{ type: 'text', text: prompt }],
          metadata: {},
        });
      }
    }
  }

  const responseMessages = normalizeOpenAICompletionsResponse(responseBody, errors);

  const requestSpec = buildSpec([
    ['Model', requestBody.model],
    ['Stream', requestBody.stream],
    ['Temperature', requestBody.temperature],
    ['Top P', requestBody.top_p],
    ['Max Tokens', requestBody.max_tokens],
    ['Stop', requestBody.stop],
    ['Presence Penalty', requestBody.presence_penalty],
    ['Frequency Penalty', requestBody.frequency_penalty],
    ['N', requestBody.n],
    ['User', requestBody.user],
    ['Tools', requestBody.tools ? sizeOf(requestBody.tools) : null],
    ['Tool Choice', requestBody.tool_choice],
  ]);

  const responseSpec = buildSpec([
    ['ID', responseBody?.id],
    ['Model', responseBody?.model],
    ['Created', responseBody?.created],
    ['Choices', Array.isArray(responseBody?.choices) ? responseBody.choices.length : null],
    ['Finish Reason', collectFinishReasons(responseBody?.choices)],
    ['Prompt Tokens', responseBody?.usage?.prompt_tokens],
    ['Completion Tokens', responseBody?.usage?.completion_tokens],
    ['Total Tokens', responseBody?.usage?.total_tokens],
  ]);

  return {
    request: {
      title: 'Request',
      messages: requestMessages,
    },
    response: {
      title: 'Response',
      messages: responseMessages,
    },
    spec: { request: requestSpec, response: responseSpec },
  };
}

function normalizeResponses(log, urlInfo, errors) {
  const requestBody = asObject(log?.request?.body);
  const responseBody = log?.response?.body;

  const requestMessages = normalizeResponsesInput(requestBody);
  const responseMessages = normalizeOpenAIResponsesOutput(responseBody, errors);

  const requestSpec = buildSpec([
    ['Model', requestBody.model],
    ['Stream', requestBody.stream],
    ['Temperature', requestBody.temperature],
    ['Top P', requestBody.top_p],
    ['Max Output Tokens', requestBody.max_output_tokens],
    ['Max Tokens', requestBody.max_tokens],
    ['Tools', requestBody.tools ? sizeOf(requestBody.tools) : null],
    ['Tool Choice', requestBody.tool_choice],
    ['Parallel Tool Calls', requestBody.parallel_tool_calls],
    ['Metadata', requestBody.metadata],
    ['Response Format', requestBody.response_format],
  ]);

  const responseSpec = buildSpec([
    ['ID', responseBody?.id],
    ['Status', responseBody?.status],
    ['Model', responseBody?.model],
    ['Created', responseBody?.created],
    ['Output', Array.isArray(responseBody?.output) ? responseBody.output.length : null],
    ['Prompt Tokens', responseBody?.usage?.input_tokens],
    ['Output Tokens', responseBody?.usage?.output_tokens],
    ['Total Tokens', responseBody?.usage?.total_tokens],
    ['Error', responseBody?.error],
  ]);

  return {
    request: {
      title: 'Request',
      messages: requestMessages,
    },
    response: {
      title: 'Response',
      messages: responseMessages,
    },
    spec: { request: requestSpec, response: responseSpec },
  };
}

function normalizeAnthropic(log, urlInfo, errors) {
  const requestBody = asObject(log?.request?.body);
  const responseBody = log?.response?.body;

  const requestMessages = [];
  if (typeof requestBody.system === 'string') {
    requestMessages.push({
      role: 'system',
      name: null,
      parts: [{ type: 'text', text: requestBody.system }],
      metadata: {},
    });
  } else if (Array.isArray(requestBody.system)) {
    requestMessages.push({
      role: 'system',
      name: null,
      parts: normalizeAnthropicContent(requestBody.system),
      metadata: {},
    });
  }
  requestMessages.push(...normalizeAnthropicMessages(requestBody.messages));

  const responseMessages = normalizeAnthropicResponse(responseBody, errors);

  const requestSpec = buildSpec([
    ['Model', requestBody.model],
    ['Stream', requestBody.stream],
    ['Max Tokens', requestBody.max_tokens],
    ['Temperature', requestBody.temperature],
    ['Top P', requestBody.top_p],
    ['Top K', requestBody.top_k],
    ['Tools', requestBody.tools ? sizeOf(requestBody.tools) : null],
    ['Tool Choice', requestBody.tool_choice],
    ['Stop Sequences', requestBody.stop_sequences],
  ]);

  const responseSpec = buildSpec([
    ['ID', responseBody?.id],
    ['Model', responseBody?.model],
    ['Stop Reason', responseBody?.stop_reason],
    ['Stop Sequence', responseBody?.stop_sequence],
    ['Input Tokens', responseBody?.usage?.input_tokens],
    ['Output Tokens', responseBody?.usage?.output_tokens],
    ['Total Tokens', responseBody?.usage?.total_tokens],
  ]);

  return {
    request: {
      title: 'Request',
      messages: requestMessages,
    },
    response: {
      title: 'Response',
      messages: responseMessages,
    },
    spec: { request: requestSpec, response: responseSpec },
  };
}

function normalizeGemini(log, urlInfo, errors) {
  const requestBody = asObject(log?.request?.body);
  const responseBody = log?.response?.body;

  const requestMessages = [];
  if (requestBody.systemInstruction) {
    const parts = normalizeGeminiParts(requestBody.systemInstruction.parts || requestBody.systemInstruction);
    requestMessages.push({
      role: 'system',
      name: null,
      parts,
      metadata: {},
    });
  }
  requestMessages.push(...normalizeGeminiMessages(requestBody.contents));

  const responseMessages = normalizeGeminiResponse(responseBody, errors);

  const generationConfig = asObject(requestBody.generationConfig);
  const requestSpec = buildSpec([
    ['Model', requestBody.model],
    ['Temperature', generationConfig.temperature],
    ['Top P', generationConfig.topP],
    ['Top K', generationConfig.topK],
    ['Max Output Tokens', generationConfig.maxOutputTokens],
    ['Candidate Count', generationConfig.candidateCount],
    ['Safety Settings', requestBody.safetySettings],
    ['Tools', requestBody.tools ? sizeOf(requestBody.tools) : null],
  ]);

  const responseSpec = buildSpec([
    ['Candidates', Array.isArray(responseBody?.candidates) ? responseBody.candidates.length : null],
    ['Prompt Tokens', responseBody?.usageMetadata?.promptTokenCount],
    ['Candidates Tokens', responseBody?.usageMetadata?.candidatesTokenCount],
    ['Total Tokens', responseBody?.usageMetadata?.totalTokenCount],
  ]);

  return {
    request: {
      title: 'Request',
      messages: requestMessages,
    },
    response: {
      title: 'Response',
      messages: responseMessages,
    },
    spec: { request: requestSpec, response: responseSpec },
  };
}

function normalizeOther(log) {
  return {
    request: {
      title: 'Request',
      messages: [],
    },
    response: {
      title: 'Response',
      messages: [],
    },
    spec: emptySpec(),
  };
}

function normalizeRequestMessages(shapeId, log) {
  const requestBody = asObject(log?.request?.body);

  if (shapeId === 'completions') {
    return normalizeCompletionsRequestMessages(requestBody);
  }
  if (shapeId === 'responses') {
    return normalizeResponsesInput(requestBody);
  }
  if (shapeId === 'anthropic') {
    return normalizeAnthropicRequestMessages(requestBody);
  }
  if (shapeId === 'gemini') {
    return normalizeGeminiRequestMessages(requestBody);
  }

  return null;
}

function normalizeCompletionsRequestMessages(requestBody) {
  const requestMessages = normalizeOpenAIChatMessages(requestBody.messages);
  if (requestMessages.length === 0 && typeof requestBody.prompt === 'string') {
    requestMessages.push({
      role: 'user',
      name: null,
      parts: [{ type: 'text', text: requestBody.prompt }],
      metadata: {},
    });
  } else if (requestMessages.length === 0 && Array.isArray(requestBody.prompt)) {
    for (const prompt of requestBody.prompt) {
      if (typeof prompt === 'string') {
        requestMessages.push({
          role: 'user',
          name: null,
          parts: [{ type: 'text', text: prompt }],
          metadata: {},
        });
      }
    }
  }
  return requestMessages;
}

function normalizeAnthropicRequestMessages(requestBody) {
  const requestMessages = [];
  if (typeof requestBody.system === 'string') {
    requestMessages.push({
      role: 'system',
      name: null,
      parts: [{ type: 'text', text: requestBody.system }],
      metadata: {},
    });
  } else if (Array.isArray(requestBody.system)) {
    requestMessages.push({
      role: 'system',
      name: null,
      parts: normalizeAnthropicContent(requestBody.system),
      metadata: {},
    });
  }
  requestMessages.push(...normalizeAnthropicMessages(requestBody.messages));
  return requestMessages;
}

function normalizeGeminiRequestMessages(requestBody) {
  const requestMessages = [];
  if (requestBody.systemInstruction) {
    const parts = normalizeGeminiParts(requestBody.systemInstruction.parts || requestBody.systemInstruction);
    requestMessages.push({
      role: 'system',
      name: null,
      parts,
      metadata: {},
    });
  }
  requestMessages.push(...normalizeGeminiMessages(requestBody.contents));
  return requestMessages;
}

function normalizeOpenAIChatMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => normalizeOpenAIChatMessage(message))
    .filter(Boolean);
}

function normalizeOpenAIChatMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const role = safeString(message.role) || 'unknown';
  const name = safeString(message.name);
  const parts = [];

  if (Array.isArray(message.content)) {
    for (const part of message.content) {
      parts.push(...normalizeOpenAIContentPart(part));
    }
  } else if (typeof message.content === 'string') {
    parts.push({ type: 'text', text: message.content });
  } else if (message.content != null) {
    parts.push({ type: 'json', json: message.content });
  }

  if (message.reasoning) {
    parts.push({ type: 'reasoning', text: String(message.reasoning) });
  }
  if (message.reasoning_content) {
    parts.push({ type: 'reasoning', text: String(message.reasoning_content) });
  }

  const toolCalls = normalizeToolCalls(message.tool_calls || message.function_call);
  parts.push(...toolCalls);

  return {
    role,
    name,
    parts,
    metadata: pickDefined({
      tool_call_id: message.tool_call_id,
      tool_calls: message.tool_calls ? sizeOf(message.tool_calls) : null,
    }),
  };
}

function normalizeOpenAIContentPart(part) {
  if (!part) return [];
  if (typeof part === 'string') {
    return [{ type: 'text', text: part }];
  }
  if (typeof part !== 'object') {
    return [{ type: 'text', text: String(part) }];
  }
  const partType = safeString(part.type);

  if (partType === 'text' || partType === 'input_text' || partType === 'output_text') {
    return [{ type: 'text', text: String(part.text || '') }];
  }
  if (partType === 'image_url' && part.image_url) {
    const url = safeString(part.image_url.url) || '';
    return [{ type: 'image', url, mimeType: safeString(part.image_url.media_type) }];
  }
  if (partType === 'input_image' && part.image_url) {
    const url = safeString(part.image_url.url) || '';
    return [{ type: 'image', url, mimeType: safeString(part.image_url.media_type) }];
  }
  if (partType === 'image' && part.url) {
    return [{ type: 'image', url: safeString(part.url), mimeType: safeString(part.media_type) }];
  }
  if (partType === 'refusal' && part.refusal) {
    return [{ type: 'refusal', text: String(part.refusal) }];
  }
  if (partType === 'reasoning' && part.text) {
    return [{ type: 'reasoning', text: String(part.text) }];
  }

  if (part.text) {
    return [{ type: 'text', text: String(part.text) }];
  }

  return [{ type: 'json', json: part }];
}

function normalizeToolCalls(toolCalls) {
  if (!toolCalls) return [];
  if (Array.isArray(toolCalls)) {
    return toolCalls.map((toolCall) => {
      if (!toolCall || typeof toolCall !== 'object') return null;
      const fn = toolCall.function || toolCall;
      return {
        type: 'tool_call',
        name: safeString(fn.name) || 'tool',
        arguments: fn.arguments || toolCall.arguments,
      };
    }).filter(Boolean);
  }
  if (typeof toolCalls === 'object') {
    return [
      {
        type: 'tool_call',
        name: safeString(toolCalls.name) || 'tool',
        arguments: toolCalls.arguments,
      },
    ];
  }
  return [];
}

function normalizeOpenAICompletionsResponse(responseBody, errors) {
  if (Array.isArray(responseBody)) {
    return normalizeOpenAIChatStreaming(responseBody, errors);
  }
  const body = asObject(responseBody);
  if (Array.isArray(body.choices)) {
    return body.choices
      .map((choice) => {
        if (!choice || typeof choice !== 'object') return null;
        if (choice.message) {
          return normalizeOpenAIChatMessage(choice.message);
        }
        if (typeof choice.text === 'string') {
          return {
            role: 'assistant',
            name: null,
            parts: [{ type: 'text', text: choice.text }],
            metadata: pickDefined({ finish_reason: choice.finish_reason }),
          };
        }
        if (choice.delta) {
          return normalizeOpenAIChatMessage({ role: choice.delta.role, content: choice.delta.content });
        }
        return null;
      })
      .filter(Boolean);
  }
  if (typeof body.text === 'string') {
    return [
      {
        role: 'assistant',
        name: null,
        parts: [{ type: 'text', text: body.text }],
        metadata: {},
      },
    ];
  }
  return [];
}

function normalizeOpenAIChatStreaming(events, errors) {
  const byIndex = new Map();
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const choices = Array.isArray(event.choices) ? event.choices : [];
    for (const choice of choices) {
      if (!choice || typeof choice !== 'object') continue;
      const index = Number.isFinite(choice.index) ? choice.index : 0;
      const delta = choice.delta || {};
      const entry = byIndex.get(index) || {
        role: delta.role || 'assistant',
        name: null,
        parts: [],
        metadata: {},
        text: '',
        reasoning: '',
      };
      if (delta.role) {
        entry.role = delta.role;
      }
      if (typeof delta.content === 'string') {
        entry.text += delta.content;
      }
      if (typeof delta.reasoning === 'string') {
        entry.reasoning += delta.reasoning;
      }
      if (delta.tool_calls) {
        entry.parts.push(...normalizeToolCalls(delta.tool_calls));
      }
      byIndex.set(index, entry);
    }
  }

  if (byIndex.size === 0 && errors) {
    errors.push('No streaming choices found for chat completions.');
  }

  return Array.from(byIndex.values()).map((entry) => {
    if (entry.text) {
      entry.parts.unshift({ type: 'text', text: entry.text });
    }
    if (entry.reasoning) {
      entry.parts.push({ type: 'reasoning', text: entry.reasoning });
    }
    delete entry.text;
    delete entry.reasoning;
    return entry;
  });
}

function normalizeResponsesInput(requestBody) {
  if (!requestBody || typeof requestBody !== 'object') return [];
  if (Array.isArray(requestBody.input)) {
    const messages = [];
    for (const item of requestBody.input) {
      if (!item || typeof item !== 'object') continue;
      if (item.role || item.content) {
        messages.push({
          role: safeString(item.role) || 'user',
          name: safeString(item.name),
          parts: normalizeOpenAIContentFromResponseInput(item.content),
          metadata: pickDefined({ id: item.id, type: item.type }),
        });
      }
    }
    if (messages.length > 0) return messages;
  }

  if (typeof requestBody.input === 'string') {
    return [
      {
        role: 'user',
        name: null,
        parts: [{ type: 'text', text: requestBody.input }],
        metadata: {},
      },
    ];
  }

  if (Array.isArray(requestBody.messages)) {
    return normalizeOpenAIChatMessages(requestBody.messages);
  }

  return [];
}

function normalizeOpenAIContentFromResponseInput(content) {
  if (content === null || typeof content === 'undefined') return [];
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  if (Array.isArray(content)) {
    const parts = [];
    for (const part of content) {
      parts.push(...normalizeOpenAIContentPart(part));
    }
    return parts;
  }
  if (typeof content === 'object') {
    return normalizeOpenAIContentPart(content);
  }
  return [{ type: 'text', text: String(content) }];
}

function normalizeOpenAIResponsesOutput(responseBody, errors) {
  if (Array.isArray(responseBody)) {
    return normalizeOpenAIResponsesStreaming(responseBody, errors);
  }
  const body = asObject(responseBody);
  const output = Array.isArray(body.output) ? body.output : [];
  if (output.length > 0) {
    const messages = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      if (item.type === 'message' || item.role || item.content) {
        messages.push({
          role: safeString(item.role) || 'assistant',
          name: safeString(item.name),
          parts: normalizeResponseContentParts(item.content),
          metadata: pickDefined({ id: item.id, type: item.type }),
        });
        continue;
      }
      if (item.type === 'output_text') {
        messages.push({
          role: 'assistant',
          name: null,
          parts: [{ type: 'text', text: String(item.text || '') }],
          metadata: pickDefined({ id: item.id, type: item.type }),
        });
        continue;
      }
      if (item.type === 'output_image' && item.image_url) {
        messages.push({
          role: 'assistant',
          name: null,
          parts: [{ type: 'image', url: safeString(item.image_url.url) }],
          metadata: pickDefined({ id: item.id, type: item.type }),
        });
      }
    }
    return messages;
  }

  if (Array.isArray(body.choices)) {
    return normalizeOpenAICompletionsResponse(body, errors);
  }

  return [];
}

function normalizeOpenAIResponsesStreaming(events, errors) {
  let aggregatedText = '';
  let aggregatedReasoning = '';
  const parts = [];
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    if (typeof event.delta === 'string') {
      aggregatedText += event.delta;
    }
    if (event.delta && typeof event.delta.text === 'string') {
      aggregatedText += event.delta.text;
    }
    if (event.delta && typeof event.delta.reasoning === 'string') {
      aggregatedReasoning += event.delta.reasoning;
    }
    if (event.type && typeof event.type === 'string') {
      const type = event.type.toLowerCase();
      if (type.includes('output_text.delta') && typeof event.delta === 'string') {
        aggregatedText += event.delta;
      }
      if (type.includes('reasoning.delta') && typeof event.delta === 'string') {
        aggregatedReasoning += event.delta;
      }
    }
  }

  if (!aggregatedText && !aggregatedReasoning && errors) {
    errors.push('No streaming output captured for responses.');
  }

  if (aggregatedText) {
    parts.push({ type: 'text', text: aggregatedText });
  }
  if (aggregatedReasoning) {
    parts.push({ type: 'reasoning', text: aggregatedReasoning });
  }

  return parts.length
    ? [{ role: 'assistant', name: null, parts, metadata: {} }]
    : [];
}

function normalizeResponseContentParts(content) {
  if (!content) return [];
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  if (!Array.isArray(content)) {
    return normalizeOpenAIContentPart(content);
  }
  const parts = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'output_text') {
      parts.push({ type: 'text', text: String(part.text || '') });
      continue;
    }
    if (part.type === 'output_image' && part.image_url) {
      parts.push({ type: 'image', url: safeString(part.image_url.url) });
      continue;
    }
    if (part.type === 'refusal' && part.refusal) {
      parts.push({ type: 'refusal', text: String(part.refusal) });
      continue;
    }
    if (part.type === 'reasoning' && part.text) {
      parts.push({ type: 'reasoning', text: String(part.text) });
      continue;
    }
    parts.push(...normalizeOpenAIContentPart(part));
  }
  return parts;
}

function normalizeAnthropicMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => {
      if (!message || typeof message !== 'object') return null;
      return {
        role: safeString(message.role) || 'user',
        name: safeString(message.name),
        parts: normalizeAnthropicContent(message.content),
        metadata: pickDefined({ id: message.id }),
      };
    })
    .filter(Boolean);
}

function normalizeAnthropicContent(content) {
  if (!content) return [];
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  if (!Array.isArray(content)) {
    return [{ type: 'text', text: String(content) }];
  }
  const parts = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') continue;
    if (part.type === 'text') {
      parts.push({ type: 'text', text: String(part.text || '') });
      continue;
    }
    if (part.type === 'image' && part.source) {
      const { source } = part;
      if (source.type === 'base64' && source.data && source.media_type) {
        parts.push({
          type: 'image',
          url: `data:${source.media_type};base64,${source.data}`,
          mimeType: source.media_type,
        });
      } else if (source.url) {
        parts.push({ type: 'image', url: safeString(source.url), mimeType: source.media_type });
      }
      continue;
    }
    parts.push({ type: 'json', json: part });
  }
  return parts;
}

function normalizeAnthropicResponse(responseBody, errors) {
  if (Array.isArray(responseBody)) {
    return normalizeAnthropicStreaming(responseBody, errors);
  }
  const body = asObject(responseBody);
  if (Array.isArray(body.content)) {
    return [
      {
        role: body.role || 'assistant',
        name: null,
        parts: normalizeAnthropicContent(body.content),
        metadata: pickDefined({ id: body.id }),
      },
    ];
  }
  if (body.completion) {
    return [
      {
        role: 'assistant',
        name: null,
        parts: [{ type: 'text', text: String(body.completion) }],
        metadata: {},
      },
    ];
  }
  return [];
}

function normalizeAnthropicStreaming(events, errors) {
  let aggregatedText = '';
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    if (event.delta && typeof event.delta.text === 'string') {
      aggregatedText += event.delta.text;
    }
    if (event.content_block && typeof event.content_block.text === 'string') {
      aggregatedText += event.content_block.text;
    }
    if (event.type === 'content_block_delta' && event.delta?.text) {
      aggregatedText += event.delta.text;
    }
  }

  if (!aggregatedText && errors) {
    errors.push('No streaming output captured for anthropic.');
  }

  return aggregatedText
    ? [
        {
          role: 'assistant',
          name: null,
          parts: [{ type: 'text', text: aggregatedText }],
          metadata: {},
        },
      ]
    : [];
}

function normalizeGeminiMessages(contents) {
  if (!Array.isArray(contents)) return [];
  return contents
    .map((content) => {
      if (!content || typeof content !== 'object') return null;
      return {
        role: normalizeGeminiRole(content.role),
        name: safeString(content.name),
        parts: normalizeGeminiParts(content.parts),
        metadata: pickDefined({})
      };
    })
    .filter(Boolean);
}

function normalizeGeminiParts(parts) {
  if (!parts) return [];
  if (!Array.isArray(parts)) {
    if (typeof parts === 'string') return [{ type: 'text', text: parts }];
    if (typeof parts === 'object' && parts.text) {
      return [{ type: 'text', text: String(parts.text) }];
    }
    return [{ type: 'json', json: parts }];
  }
  const normalized = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    if (part.text) {
      normalized.push({ type: 'text', text: String(part.text) });
      continue;
    }
    if (part.inline_data && part.inline_data.data) {
      const mime = part.inline_data.mime_type || 'image/png';
      normalized.push({
        type: 'image',
        url: `data:${mime};base64,${part.inline_data.data}`,
        mimeType: mime,
      });
      continue;
    }
    if (part.file_data && part.file_data.file_uri) {
      normalized.push({ type: 'file', url: safeString(part.file_data.file_uri) });
      continue;
    }
    if (part.function_call) {
      normalized.push({
        type: 'tool_call',
        name: safeString(part.function_call.name) || 'tool',
        arguments: part.function_call.args,
      });
      continue;
    }
    normalized.push({ type: 'json', json: part });
  }
  return normalized;
}

function normalizeGeminiResponse(responseBody, errors) {
  if (Array.isArray(responseBody)) {
    return normalizeGeminiStreaming(responseBody, errors);
  }
  const body = asObject(responseBody);
  if (!Array.isArray(body.candidates)) return [];
  return body.candidates
    .map((candidate) => {
      if (!candidate || typeof candidate !== 'object') return null;
      const content = candidate.content || {};
      return {
        role: normalizeGeminiRole(content.role) || 'assistant',
        name: safeString(content.name),
        parts: normalizeGeminiParts(content.parts),
        metadata: pickDefined({ finish_reason: candidate.finishReason }),
      };
    })
    .filter(Boolean);
}

function normalizeGeminiStreaming(events, errors) {
  let aggregatedText = '';
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const candidates = Array.isArray(event.candidates) ? event.candidates : [];
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        if (part?.text) aggregatedText += String(part.text);
      }
    }
  }

  if (!aggregatedText && errors) {
    errors.push('No streaming output captured for gemini.');
  }

  return aggregatedText
    ? [
        {
          role: 'assistant',
          name: null,
          parts: [{ type: 'text', text: aggregatedText }],
          metadata: {},
        },
      ]
    : [];
}

function normalizeGeminiRole(role) {
  const normalized = safeString(role);
  if (!normalized) return 'user';
  if (normalized === 'model') return 'assistant';
  return normalized;
}

function buildSpec(entries) {
  return entries
    .filter(([label, value]) => value !== undefined && value !== null)
    .map(([label, value]) => ({ label, value: formatSpecValue(value) }));
}

function formatSpecValue(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} item(s)`;
  if (typeof value === 'object') {
    const text = JSON.stringify(value);
    if (!text) return 'object';
    return text.length > 180 ? `${text.slice(0, 180)}...` : text;
  }
  return String(value);
}

function collectFinishReasons(choices) {
  if (!Array.isArray(choices)) return null;
  const reasons = Array.from(
    new Set(
      choices
        .map((choice) => choice?.finish_reason)
        .filter((reason) => typeof reason === 'string' && reason.trim())
    )
  );
  return reasons.length ? reasons.join(', ') : null;
}

function sizeOf(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return null;
}

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function emptyPreviewSection() {
  return { title: '', messages: [] };
}

function emptySpec() {
  return { request: [], response: [] };
}

function safeString(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function pickDefined(object) {
  const output = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (value !== undefined && value !== null) {
      output[key] = value;
    }
  }
  return output;
}
