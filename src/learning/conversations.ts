import { prepareLearning } from './workflow.js';

function fields(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) throw new Error('对话材料存在缺失或未知字段。');
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error(`${label}必须为非空文本。`);
}

export function normalizeConversation(input) {
  fields(input, ['title', 'format'], ['text', 'messages', 'messageIds']);
  text(input.title, '材料标题');
  if (input.title.length > 300) throw new Error('材料标题最多 300 个字符。');
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 1024 * 1024) throw new Error('对话输入最多 1 MiB，请先缩小材料范围。');
  let entries;
  let inputEntries;
  let kind;
  const limitations = ['仅包含用户显式提交的片段，不表示完整会话；准备任务不表示宿主已经执行分析。'];
  if (input.format === 'text') {
    fields(input, ['title', 'format', 'text']);
    text(input.text, '原始文本');
    entries = [{ id: 'text-1', role: 'document', text: input.text }];
    inputEntries = 1;
    kind = 'text';
    limitations.push('纯文本未提供可验证的消息角色、时间或分支，保留为 document；不会根据称谓猜测角色。');
  } else if (input.format === 'messages') {
    fields(input, ['title', 'format', 'messages'], ['messageIds']);
    if (!Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 1000) throw new Error('结构化对话需要 1–1000 条消息。');
    const ids = new Set();
    for (const message of input.messages) {
      fields(message, ['id', 'role', 'text']);
      if (typeof message.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(message.id) || ids.has(message.id)) throw new Error('消息 ID 无效或重复。');
      if (!['user', 'assistant', 'tool', 'document'].includes(message.role)) throw new Error('消息角色必须为 user、assistant、tool 或 document。');
      text(message.text, '消息正文');
      ids.add(message.id);
    }
    if (input.messageIds !== undefined && (!Array.isArray(input.messageIds) || !input.messageIds.length
      || new Set(input.messageIds).size !== input.messageIds.length || input.messageIds.some(id => !ids.has(id)))) throw new Error('选择的消息 ID 必须非空、不重复且存在于材料中。');
    const selection = input.messageIds === undefined ? ids : new Set(input.messageIds);
    entries = input.messages.filter(message => selection.has(message.id)).map(message => ({ ...message }));
    inputEntries = input.messages.length;
    kind = 'conversation';
    limitations.push('仅保留显式消息 ID、角色和原始顺序；时间、分支和父消息字段当前不支持，提交时会拒绝。');
  } else throw new Error('对话格式仅支持 text 或 messages。');
  return {
    source: { schemaVersion: '0.1.0', title: input.title, kind, entries },
    coverage: { inputEntries, selectedEntries: entries.length, omittedEntries: inputEntries - entries.length },
    limitations,
  };
}

export async function prepareConversation(libraryRoot, input) {
  const { source, coverage, limitations } = normalizeConversation(input);
  const task = await prepareLearning(libraryRoot, { source, recipeId: 'conversation-decisions' });
  return { task, coverage, limitations };
}
