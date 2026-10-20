/**
 * Deterministic, local copy preflight. Findings are editing suggestions, not a
 * factual, legal or regulatory review. All input and output remain plain text.
 */
export const RULES = Object.freeze([
  { id: 'empty-document', name: '文档内容', category: '基础检查', description: '检查是否包含可审核的文字。' },
  { id: 'placeholders', name: '占位内容', category: '发布准备', description: '查找未替换的模板变量、TODO 和明确的待填写标记。' },
  { id: 'repeated-words', name: '重复词语', category: '文字规范', description: '检查相邻英文重复词及明显重复的中文助词。' },
  { id: 'extra-spaces', name: '多余空格', category: '文字规范', description: '检查正文内部连续空格；忽略行首缩进、表格和代码块。' },
  { id: 'project-name', name: '产品名称', category: '品牌一致性', description: '提供项目名称时，检查同一型号的大小写和分隔符写法。' },
  { id: 'punctuation', name: '标点配对', category: '文字规范', description: '检查全半角括号混用及中文语句中的半角标点。' },
  { id: 'unit-spacing', name: '数值与单位', category: '参数规范', description: '提示数字与常见拉丁字母计量单位之间缺少空格；型号和百分比除外。' },
  { id: 'absolute-claims', name: '宣传措辞', category: '人工复核', description: '提示可能需要证据或限定条件的绝对化表述，不作法律合规结论。' },
].map(rule => Object.freeze(rule)));

export const SAMPLE_DOCUMENTS = Object.freeze([
  {
    id: 'sample-r501p',
    projectName: 'R501P-S60 Pro Max',
    filename: 'R501P-S60-Pro-Max_上市文案.txt',
    title: 'R501P-S60 Pro Max · 上市文案',
    text: `R501P-S60 Pro Max｜上市文案初稿

让日常清洁，从容发生。
R501P S60 Pro Max 为多种家庭清洁场景提供支持。
额定功率为 65W，具体参数请以最终产品说明书为准。
新品搭载  灵活清洁组件，让桌面与角落更易打理。
这是一款完美解决所有清洁难题的产品。
了解更多：{{产品链接}}
上市时间：【待确认】

内部备注：本段是演示文案，参数和宣传内容均需项目负责人复核。`,
  },
  {
    id: 'sample-r521p',
    projectName: 'R521P',
    filename: 'R521P_详情页文案.txt',
    title: 'R521P · 详情页文案',
    text: `R521P｜详情页文案初稿

为每一种日常，留出整洁的空间。
R521P 支持日常清洁，操作便捷。
额定功率：50 W。
Clean clean spaces, simple routines.
适用场景（以说明书为准)。
服务说明, 请以实际订单条款为准。
购买入口：TBD

内部备注：本段是演示文案，参数需结合正式产品资料核对。`,
  },
  {
    id: 'sample-e2',
    projectName: 'E2 Station',
    filename: 'E2-Station_品牌介绍.txt',
    title: 'E2 Station · 品牌介绍',
    text: `E2 Station｜品牌介绍

把日常整理，交给更从容的节奏。
E2 Station 为家庭清洁提供辅助支持。
额定功率：45 W；电池容量：3000 mAh。
请根据产品说明书选择适合的使用环境。

内部备注：本段是无规则命中示例，参数仍需人工核对。`,
  },
].map(document => Object.freeze(document)));

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COUNTABLE_WORDS = /\p{Script=Han}|[^\P{L}\p{Script=Han}](?:[^\P{L}\p{Script=Han}]|[\p{M}\p{N}'’_-])*|\p{N}+(?:[.,]\p{N}+)*/gu;
const PLACEHOLDERS = /\{\{[^{}\n]{1,80}\}\}|\$\{[^{}\n]{1,80}\}|\b(?:TODO|TBD|FIXME)\b|【(?:待补充|待确认|待替换|占位[^】\n]{0,30})】|\[(?:待补充|待确认|待替换|产品名称|产品链接|请输入[^\]\n]{0,30})\]/gi;
const NUMBER_UNIT = /(?<![A-Za-z0-9])(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:GB\/s|MB\/s|m\/s|kWh|mAh|GHz|MHz|kHz|kPa|kW|Wh|Hz|mL|ml|mm|cm|km|kg|mg|GB|MB|TB|Pa|W|V|A)(?![A-Za-z0-9])/g;
const ABSOLUTE_CLAIMS = /全球第一|行业第一|全网第一|销量第一|世界第一|绝对安全|绝无风险|零风险|百分之百(?:有效|安全|可靠)|100%\s*(?:有效|安全|可靠)|永久有效|完美解决(?:所有|一切)|最先进|顶级|唯一选择/g;

/** Return escaped-free plain strings. Render with textContent, not innerHTML. */
export function analyzeDocument(text, { filename = '', projectName = '', enabledRules = RULES.map(r=>r.id) } = {}) {
  const source = text == null ? '' : String(text);
  const canonicalName = String(projectName || '').trim();
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const activeRules=RULES.filter(rule=>enabledRules.includes(rule.id));
  const findings = [];
  const occurrences = new Map();
  let inCodeFence = false;

  function add(ruleId, line, match, message, suggestion, severity = 'warning') {
    if(!activeRules.some(rule=>rule.id===ruleId))return;
    const occurrenceKey = `${ruleId}-${line}`;
    const ordinal = (occurrences.get(occurrenceKey) || 0) + 1;
    occurrences.set(occurrenceKey, ordinal);
    const rule = RULES.find(item => item.id === ruleId);
    const lineText = (lines[line - 1] || '').trim();
    const matchAt = lineText.indexOf(match);
    const start = Math.max(0, matchAt - 50);
    const excerpt = `${start ? '…' : ''}${lineText.slice(start, start + 160)}${lineText.length > start + 160 ? '…' : ''}`;
    findings.push({
      id: `${occurrenceKey}-${ordinal}`,
      ruleId,
      ruleName: rule.name,
      severity,
      message,
      excerpt,
      line,
      suggestion,
    });
  }

  if (!source.trim()) {
    add('empty-document', 1, '', '文档为空，尚无可审核内容。', '粘贴文案或导入包含文字的文档后重新运行。', 'error');
  }

  // Match only alternate spellings of the exact supplied model, not other
  // product names that might be intentionally mentioned in comparison copy.
  const nameSegments = canonicalName.split(/[ \t_\u2010-\u2015-]+/).filter(Boolean);
  const modelPattern = nameSegments.length && canonicalName.length <= 120
    ? new RegExp(`(?<![A-Za-z0-9])${nameSegments.map(escapeRegex).join('[ \\t_\\u2010-\\u2015-]*')}(?![A-Za-z0-9])`, 'giu')
    : null;

  lines.forEach((lineText, index) => {
    const line = index + 1;
    if (/^\s*(```|~~~)/.test(lineText)) {
      inCodeFence = !inCodeFence;
      return;
    }
    if (inCodeFence) return;

    for (const match of lineText.matchAll(PLACEHOLDERS)) {
      add('placeholders', line, match[0], `仍有未替换的占位内容：${match[0]}`, '补充已确认的信息；发布前移除内部待办标记。', 'error');
    }

    for (const match of lineText.matchAll(/\b([a-z][a-z'’-]+)[ \t]+\1\b/gi)) {
      add('repeated-words', line, match[0], `发现相邻重复词：“${match[0]}”。`, `核对是否应保留一个“${match[1]}”。`);
    }
    for (const match of lineText.matchAll(/的的|和和|与与|及及/g)) {
      add('repeated-words', line, match[0], `发现可能重复的助词：“${match[0]}”。`, `核对是否应改为“${match[0][0]}”。`);
    }

    if (!/^\s*\|.*\|\s*$/.test(lineText)) {
      for (const match of lineText.trim().matchAll(/(?<=\S)[ \t]{2,}(?=\S)/g)) {
        add('extra-spaces', line, match[0], '正文词语之间存在连续空格。', '确认是否有排版用途；普通正文中可合并为一个空格。');
      }
    }

    if (modelPattern) {
      for (const match of lineText.matchAll(modelPattern)) {
        if (match[0] !== canonicalName) {
          add('project-name', line, match[0], `产品名称写作“${match[0]}”，与当前项目名称不一致。`, `如指同一产品，请统一为“${canonicalName}”。`);
        }
      }
    }

    for (const match of lineText.matchAll(/（[^（）()\n]{1,100}\)|\([^（）()\n]{1,100}）/g)) {
      add('punctuation', line, match[0], '一组括号混用了全角和半角形式。', '统一成一对中文括号“（）”或一对英文括号“()”。');
    }
    for (const match of lineText.matchAll(/\p{Script=Han}[,;:!?](?=\s*\p{Script=Han}|\s*$)/gu)) {
      add('punctuation', line, match[0], '中文语句中出现半角标点。', '核对语境；中文正文通常使用“，；：！？”等全角标点。');
    }

    for (const match of lineText.matchAll(NUMBER_UNIT)) {
      const spaced = match[0].replace(/^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)/, '$1 ');
      add('unit-spacing', line, match[0], `数值与单位之间缺少空格：“${match[0]}”。`, `建议写作“${spaced}”；请以项目参数排版规范为准。`);
    }

    for (const match of lineText.matchAll(ABSOLUTE_CLAIMS)) {
      add('absolute-claims', line, match[0], `“${match[0]}”需要人工复核依据及适用范围。`, '补充可核验的依据和限定条件，或使用更具体的描述；此项仅为文案提示。');
    }
  });

  const order = new Map(RULES.map((rule, index) => [rule.id, index]));
  findings.sort((a, b) => a.line - b.line || order.get(a.ruleId) - order.get(b.ruleId));
  const rules = activeRules.map(rule => {
    const matches = findings.filter(finding => finding.ruleId === rule.id);
    return {
      id: rule.id,
      name: rule.name,
      status: matches.some(finding => finding.severity === 'error') ? 'failed' : matches.length ? 'warning' : 'passed',
      count: matches.length,
    };
  });

  return {
    findings,
    rules,
    wordCount: [...source.matchAll(COUNTABLE_WORDS)].length,
    charCount: [...source].length,
    lineCount: source.trim() ? lines.length : 0,
    summary: {
      errors: findings.filter(finding => finding.severity === 'error').length,
      warnings: findings.filter(finding => finding.severity === 'warning').length,
      passed: rules.filter(rule => rule.status === 'passed').length,
      totalRules: activeRules.length,
    },
    metadata: { filename: String(filename || ''), projectName: canonicalName },
  };
}
