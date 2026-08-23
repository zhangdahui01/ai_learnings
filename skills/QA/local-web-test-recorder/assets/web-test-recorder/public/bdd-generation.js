const STATUS_LABELS = {
  queued: '等待生成', generating: '正在生成', generated: '脚本已生成',
  'awaiting-replay': '等待手工回放', validating: '正在回放',
  'fix-queued': '等待 Agent 修复', failed: '回放失败',
  'awaiting-qa': '等待 QA 签署', 'signed-off': 'QA 已签署', rejected: 'QA 已退回',
  verified: '历史任务已验证',
};

function activeStatus(status) { return ['queued', 'generating', 'generated', 'validating', 'fix-queued'].includes(status); }
function statusClass(status) { return ['signed-off', 'awaiting-qa'].includes(status) ? 'success' : ['failed', 'rejected'].includes(status) ? 'failure' : ''; }
function artifactLabel(type) { return { trace: 'Trace', screenshot: '截图', video: '录像', file: '文件' }[type] || '文件'; }
async function copyText(value, toast) {
  try { await navigator.clipboard.writeText(String(value || '')); toast('已复制，可粘贴给当前 AI Agent'); }
  catch { toast('复制失败，请手工选择文本复制', 'error'); }
}

export function openGenerationDialog({ item, knowledge, plans = [], suites = [], testCases = [], runtime, api, esc, toast, refresh, lines, openKnowledgeManager }) {
  const ready = knowledge.filter(source => source.graphReady && source.graph?.status === 'ready');
  const usablePlans = plans.filter(plan => suites.some(suite => suite.planId === plan.id));
  const node = document.createElement('div');
  node.className = 'modal-backdrop';
  node.innerHTML = `<div class="modal bdd-generation-modal">
    <h2>生成、回放与 QA 验收</h2>
    <div class="generation-gates"><div class="pass">✓ 1. BDD 已 QA 批准（必需）</div><div class="${ready.length ? 'pass' : 'fail'}">${ready.length ? '✓' : '✕'} 2. Repo 知识图谱 ${ready.length ? 'READY（必需）' : '缺失'}</div><div class="pass">✓ 3. Generator Agent（推荐）</div><div>○ Codegen 录制（可选补充）</div></div>
    <div class="notice"><b>运行环境：</b>${esc(runtime.label)}。平台创建任务，当前 AI Agent 负责生成或修复；平台负责真实回放、错误证据和 QA 门禁。</div>
    <div class="field-grid"><div class="field"><label>生成后归属 Test Plan（必需）</label><select id="generationPlan"><option value="">请选择 Test Plan</option>${usablePlans.map(plan => `<option value="${esc(plan.id)}">${esc(plan.name)}</option>`).join('')}</select></div><div class="field"><label>生成后归属 Test Suite（必需）</label><select id="generationSuite" disabled><option value="">请先选择 Test Plan</option></select></div></div>
    <div class="field"><label>重复生成时如何保存</label><select id="generationExistingCase" disabled><option value="">新建一个 BDD 生成 Test Case</option></select><small>若该 BDD 已在所选 Suite 生成过 Case，可选择“覆盖并创建新版本”。原生代码、回放记录和历史版本都会保留；不会覆盖其他人工 Test Case。</small></div>
    <div class="generation-target-copy"><b>脚本会保存在哪里？</b><span>不会写入知识图谱 Repo。生成成功后，平台会在所选 <em>Test Plan → Test Suite</em> 下创建一个“BDD 生成”的 Test Case，把原生 Playwright 脚本作为该 Case 的原生代码并纳入版本、回放、截图、Trace 和 QA 验收。选择覆盖时，更新同一个 Test Case 并创建新版本。</span></div>
    <div class="field"><div class="split"><label>参考知识图谱（多选、至少一个）</label><button type="button" class="btn small secondary" id="openKnowledgeManager">管理 / 新建知识图谱</button></div><div class="knowledge-selector">${ready.map(source => `<label data-graph-option="${esc(source.id)}"><input type="checkbox" data-generation-graph value="${esc(source.id)}" checked><span><b>${esc(source.name)}</b><small>${esc(source.repoPath)} · ${esc(source.graph?.provider||'local graph')}</small></span></label>`).join('')}</div><small>知识图谱是只读参考：可同时勾选开发 Repo、Page Object/组件 Repo 和已有 UI 自动化 Repo。它们不会成为脚本写入位置。</small></div>
    <div class="field"><label>生成后如何回放</label><select id="replayMode"><option value="auto">自动回放（推荐）</option><option value="manual">由 QA 手工点击回放</option></select><small>自动回放失败后可进入 Agent 修复队列；每次修复提交后再次自动回放。</small></div>
    <div class="field-grid"><label class="check-row"><input type="checkbox" id="autoFix" checked> 失败后进入自动修复队列</label><div class="field"><label>最大回放 / 修复轮次</label><select id="maxAttempts">${[1,2,3,4,5,6,8,10].map(value => `<option ${value === 5 ? 'selected' : ''}>${value}</option>`).join('')}</select></div></div>
    <label class="check-row"><input type="checkbox" id="useGenerator" checked> 使用当前 ${esc(runtime.label)} 调用 Playwright Generator Agent（推荐）</label>
    <div class="field"><label>可选：直接粘贴 Playwright Inspector / Codegen 原生脚本</label><textarea id="generatorCodegenScript" class="generation-codegen-editor" spellcheck="false" placeholder="从 Playwright Inspector 复制完整脚本后，直接粘贴到这里。\n\nimport { test, expect } from 'playwright/test';\ntest('payment', async ({ page }) => {\n  await page.goto('https://...');\n});"></textarea><small>适用于 iframe、支付键盘、弹窗等复杂流程。平台会把它保存到此生成任务的本地证据目录，供 Agent 只读参考；不会覆盖 BDD，也不会写入目标 Repo。请勿粘贴真实密码、Token 或生产敏感数据。</small></div>
    <details class="codegen-path-details"><summary>已有 Codegen 文件路径（可选）</summary><div class="field"><label>每行一个绝对路径</label><textarea id="generatorRecordings" placeholder="/repo/recordings/coupay-login.spec.js"></textarea><small>若脚本已经保存为本地文件，可在这里附加；会与上方粘贴的脚本一起作为证据。</small></div></details>
    <div class="qa-gate-copy"><b>最终门禁</b><span>回放通过 ≠ 正式通过。任务会停在“等待 QA 签署”，必须由 QA 填写签署人并批准。</span></div>
    <div class="output-preview"><b>输出约定</b><code>specs/${esc(item.tenant.toLowerCase())}/${esc(item.region.toLowerCase())}/${esc(item.scenarioId)}.md</code><code>tests/${esc(item.tenant.toLowerCase())}/${esc(item.region.toLowerCase())}/${esc(item.scenarioId)}.spec.ts</code></div>
    <div class="actions"><button class="btn primary" id="triggerGeneration" ${ready.length ? '' : 'disabled'}>创建生成与验证任务</button><button class="btn secondary" data-close>取消</button></div><div id="generationResult"></div>
  </div>`;
  document.body.append(node);
  node.querySelector('[data-close]').onclick = () => node.remove();
  node.querySelector('#openKnowledgeManager')?.addEventListener('click', () => { node.remove(); openKnowledgeManager?.(); });
  const planSelect = node.querySelector('#generationPlan'); const suiteSelect = node.querySelector('#generationSuite'); const caseSelect = node.querySelector('#generationExistingCase');
  const syncCases = () => { const choices = testCases.filter(testCase => testCase.suiteId === suiteSelect.value && (testCase.caseKind === 'bdd-generated' || testCase.data?.bddCaseId === item.id) && testCase.data?.bddCaseId === item.id); caseSelect.disabled = !suiteSelect.value; caseSelect.innerHTML = `<option value="">新建一个 BDD 生成 Test Case</option>${choices.map(testCase => `<option value="${esc(testCase.id)}">覆盖 ${esc(testCase.name)} · 当前 v${esc(testCase.currentVersion || testCase.version || 1)}</option>`).join('')}`; };
  const syncSuites = () => { const planId = planSelect.value; const choices = suites.filter(suite => suite.planId === planId); suiteSelect.disabled = !choices.length; suiteSelect.innerHTML = choices.length ? `<option value="">请选择 Test Suite</option>${choices.map(suite => `<option value="${esc(suite.id)}">${esc(suite.name)}</option>`).join('')}` : '<option value="">请先选择 Test Plan</option>'; syncCases(); };
  planSelect?.addEventListener('change', syncSuites); suiteSelect?.addEventListener('change', syncCases); syncSuites();
  node.querySelector('#triggerGeneration').onclick = async () => {
    try {
      const knowledgeSourceIds = [...node.querySelectorAll('[data-generation-graph]:checked')].map(input => input.value);
      if (!knowledgeSourceIds.length) throw new Error('至少选择一个 READY 知识图谱');
      if (!planSelect.value || !suiteSelect.value) throw new Error('请先选择生成 Test Case 的 Test Plan 和 Test Suite');
      const job = await api(`/api/bdd-cases/${item.id}/generation-jobs`, { method: 'POST', body: JSON.stringify({
        targetPlanId: planSelect.value,
        targetSuiteId: suiteSelect.value,
        targetCaseId: caseSelect.value || undefined,
        knowledgeSourceIds,
        replayMode: node.querySelector('#replayMode').value,
        autoFix: node.querySelector('#autoFix').checked,
        maxAttempts: Number(node.querySelector('#maxAttempts').value),
        useGeneratorAgent: node.querySelector('#useGenerator').checked,
        recordings: lines(node.querySelector('#generatorRecordings').value),
        codegenScript: node.querySelector('#generatorCodegenScript').value,
      }) });
      node.querySelector('#generationResult').innerHTML = `<div class="notice success"><strong>任务已创建：${esc(job.id)}</strong><p>${esc(STATUS_LABELS[job.status] || job.status)}</p><p>归属：${esc(job.platformTarget?.planName)} → ${esc(job.platformTarget?.suiteName)} → ${esc(job.platformTarget?.caseName || '脚本生成后创建 Test Case')}</p><p>下一步：把下面指令交给当前 AI Agent；Agent 会读取任务、图谱证据并提交脚本，平台随后创建/覆盖该 Test Case、回放和循环修复。</p><pre id="newAgentInstruction">${esc(job.agentInstruction||'')}</pre><button class="btn small secondary" id="copyNewAgentInstruction">复制 Agent 指令</button></div>`;
      node.querySelector('#copyNewAgentInstruction').onclick=()=>copyText(job.agentInstruction,toast);
      toast('生成、回放与 QA 验收任务已创建');
      await refresh(true);
    } catch (error) { toast(error.message, 'error'); }
  };
}

export function renderGenerationQueue({ jobs, cases, runtime, api, esc, toast, refresh }) {
  const workspace = document.querySelector('#bddWorkspace');
  const pipeline = job => {
    const replay = job.validation || {};
    const qa = job.qaSignOff || { status: 'pending' };
    const generated = !['queued', 'generating'].includes(job.status);
    const replayDone = replay.latestStatus === 'passed' || replay.latestStatus === 'failed';
    const repairState = job.status === 'fix-queued' ? 'active' : replay.attemptCount > 1 ? 'done' : '';
    return `<div class="generation-pipeline"><div class="${generated ? 'done' : 'active'}"><b>1</b><span>生成脚本</span></div><div class="${job.status === 'validating' ? 'active' : replayDone ? 'done' : ''}"><b>2</b><span>真实回放</span></div><div class="${repairState}"><b>3</b><span>自动修复</span></div><div class="${qa.status === 'approved' ? 'done' : job.status === 'awaiting-qa' ? 'active' : ''}"><b>4</b><span>QA 签署</span></div></div>`;
  };
  const attemptHtml = attempt => `<article class="attempt-row ${attempt.status}"><div class="split"><strong>第 ${attempt.number} 次 · ${attempt.status === 'passed' ? '通过' : '失败'}</strong><span>${esc(attempt.trigger)} · ${esc(attempt.finishedAt || '')}</span></div>${attempt.errorSummary ? `<div class="error-summary">${esc(attempt.errorSummary)}</div>` : ''}<div class="artifact-links">${(attempt.artifacts || []).map(file => `<a class="btn small secondary" href="${esc(file.url)}" target="_blank">${artifactLabel(file.type)} · ${esc(file.name)}</a>`).join('') || '<span class="muted">本轮未产生附件；Trace 固定开启，截图/录像遵循目标 Repo 配置。</span>'}</div><details><summary>命令与完整输出</summary><code>${esc(attempt.command || '')}</code><pre>${esc(`${attempt.stderr || ''}\n${attempt.stdout || ''}`)}</pre></details></article>`;
  workspace.innerHTML = `<section class="panel generation-board"><div class="panel-head"><div><h2>Playwright 生成与验证流水线</h2><p>生成 → 回放 → 失败修复 → 再回放，直到通过或达到上限；最后必须 QA 签署。</p></div><div class="actions"><span class="badge">${esc(runtime.label)}</span><button class="btn small secondary" id="refreshGenerationJobs">刷新进度</button></div></div>
    <div class="pipeline-legend"><span>自动模式：Agent 提交代码后平台立即回放</span><span>手工模式：QA 点击“开始回放”</span><span>自动修复：失败证据进入 Agent 修复队列</span></div>
    <div class="job-list">${jobs.map(job => {
      const validation = job.validation || {}; const qa = job.qaSignOff || {};
      const caseItem = cases.find(item => item.id === job.bddCaseId);
      const canReplay = ['generated', 'awaiting-replay', 'failed', 'fix-queued', 'awaiting-qa'].includes(job.status);
      const instruction=job.agentInstruction||`使用 local-web-test-recorder Skill 处理 Playwright 生成任务 ${job.id}，生成或修复后提交 result API，回放通过后等待 QA 签署。`;
      const graphSummary=(job.sources?.retrievalSummary||[]).map(source=>`${source.sourceName}: ${source.matchedFiles} files`).join(' · ');
      return `<article class="job-row" data-generation-job="${esc(job.id)}"><div class="split"><div><h3>${esc(caseItem?.scenarioId || job.bddCaseId)}</h3><p>${esc(job.generator?.engine || '历史任务')} · ${esc(job.runtime?.label || '历史任务')}</p><small>${esc(job.outputs?.testRelativePath || '历史任务未记录输出路径')}</small></div><span class="badge ${statusClass(job.status)}">${esc(STATUS_LABELS[job.status] || job.status)}</span></div>
        ${pipeline(job)}
        <div class="job-policy"><span>${validation.replayMode === 'manual' ? '手工回放' : '自动回放'}</span><span>${validation.autoFix === false ? '不自动修复' : '自动修复'}</span><span>${validation.attemptCount || 0} / ${validation.maxAttempts || 5} 次</span><span>QA：${esc(qa.status || 'pending')}</span></div>
        <div class="job-evidence"><b>本任务冻结的输入</b><span>平台归属： <i data-i18n-skip>${esc(job.platformTarget ? `${job.platformTarget.planName} → ${job.platformTarget.suiteName} → ${job.platformTarget.caseName || '等待脚本生成后创建 Test Case'}` : '历史任务：外部 Repo 输出')}</i></span><span>图谱检索：${esc(graphSummary||'历史任务未记录命中文件')}</span><span>Codegen：${esc((job.sources?.recordings||[]).join(', ')||'未提供')}</span></div>
        ${['queued','fix-queued'].includes(job.status)?`<div class="notice"><b>交给当前 AI Agent</b><pre>${esc(instruction)}</pre><button class="btn small secondary" data-copy-agent="${esc(job.id)}">复制 Agent 指令</button></div>`:''}
        ${job.status === 'fix-queued' ? `<div class="notice warning"><b>等待当前 AI Agent 修复</b><p>Agent 应读取最新错误、Trace/截图/录像，最小化修改脚本并重新提交；平台随后继续回放。</p><details><summary>修复 Prompt</summary><pre>${esc(job.fixPrompt || '')}</pre></details></div>` : ''}
        <div class="actions"><button class="btn small primary" data-replay="${esc(job.id)}" ${canReplay ? '' : 'disabled'}>▶ 开始回放</button><button class="btn small secondary" data-sign="${esc(job.id)}" ${job.status === 'awaiting-qa' ? '' : 'disabled'}>QA 签署</button></div>
        ${job.result?.code?`<details><summary>生成脚本（可由 QA/开发修正后重新回放）</summary><div class="field"><textarea class="generation-code-editor" data-job-code="${esc(job.id)}">${esc(job.result.code)}</textarea></div><div class="actions"><button class="btn small primary" data-save-job-code="${esc(job.id)}">保存代码并重新回放</button></div></details>`:''}
        ${job.status!=='signed-off'?`<details><summary>追加 Codegen 录制证据</summary><p class="muted">第一次生成不准确时，可录制复杂 iframe、支付键盘或弹窗流程并追加绝对路径；Agent 下一轮会同时参考。</p><div class="field"><textarea data-job-recordings="${esc(job.id)}" placeholder="/absolute/path/to/recording.spec.js"></textarea></div><button class="btn small secondary" data-add-recordings="${esc(job.id)}">追加证据</button></details>`:''}
        <details ${validation.attempts?.length ? 'open' : ''}><summary>回放记录与错误 (${validation.attempts?.length || 0})</summary><div class="attempt-list">${(validation.attempts || []).slice().reverse().map(attemptHtml).join('') || '<p class="muted">尚未回放。</p>'}</div></details>
        <details><summary>全流程进度</summary><ol class="progress-log">${(job.progress || []).map(step => `<li><b>${esc(step.stage)}</b> · ${esc(step.status)}<span>${esc(step.message)}</span><time>${esc(step.at)}</time></li>`).join('')}</ol></details>
        <details><summary>生成 Prompt / 证据</summary><pre>${esc(job.prompt || '')}</pre></details>
      </article>`;
    }).join('') || '<div class="empty"><p>还没有脚本生成任务。</p></div>'}</div></section>`;
  document.querySelector('#refreshGenerationJobs').onclick = () => refresh(true);
  document.querySelectorAll('[data-replay]').forEach(button => button.onclick = async () => {
    button.disabled = true; button.textContent = '回放中…';
    try { await api(`/api/generation-jobs/${button.dataset.replay}/replay`, { method: 'POST', body: JSON.stringify({ trigger: 'manual' }) }); toast('回放已完成，请查看结果'); await refresh(true); }
    catch (error) { toast(error.message, 'error'); button.disabled = false; button.textContent = '▶ 开始回放'; }
  });
  document.querySelectorAll('[data-sign]').forEach(button => button.onclick = () => openSignOff(button.dataset.sign, { api, esc, toast, refresh }));
  document.querySelectorAll('[data-copy-agent]').forEach(button=>button.onclick=()=>{const job=jobs.find(item=>item.id===button.dataset.copyAgent);return copyText(job?.agentInstruction||`使用 local-web-test-recorder Skill 处理 Playwright 生成任务 ${button.dataset.copyAgent}`,toast);});
  document.querySelectorAll('[data-save-job-code]').forEach(button=>button.onclick=async()=>{const jobId=button.dataset.saveJobCode,code=document.querySelector(`[data-job-code="${jobId}"]`).value;button.disabled=true;try{await api(`/api/generation-jobs/${jobId}/result`,{method:'PUT',body:JSON.stringify({code,notes:'QA/开发在线修正后重新提交'})});toast('代码已保存，并按本任务策略进入回放');await refresh(true);}catch(error){toast(error.message,'error');button.disabled=false;}});
  document.querySelectorAll('[data-add-recordings]').forEach(button=>button.onclick=async()=>{const jobId=button.dataset.addRecordings,recordings=document.querySelector(`[data-job-recordings="${jobId}"]`).value.split(/\n+/).map(value=>value.trim()).filter(Boolean);button.disabled=true;try{await api(`/api/generation-jobs/${jobId}/recordings`,{method:'POST',body:JSON.stringify({recordings})});toast('Codegen 证据已追加，下一轮生成或修复会使用');await refresh(true);}catch(error){toast(error.message,'error');button.disabled=false;}});
  if (jobs.some(job => activeStatus(job.status))) window.setTimeout(() => refresh(true), 3000);
}

function openSignOff(jobId, { api, esc, toast, refresh }) {
  const node = document.createElement('div'); node.className = 'modal-backdrop';
  node.innerHTML = `<div class="modal qa-signoff-modal"><h2>QA 最终签署</h2><div class="notice"><b>签署前请确认：</b>最新回放已经通过，并已检查关键断言、Trace 及必要的截图/录像。机器 PASS 不能代替业务验收。</div><div class="field"><label>QA 签署人</label><input id="qaReviewer" placeholder="姓名或团队账号"></div><div class="field"><label>评审意见</label><textarea id="qaComments" placeholder="通过说明；退回时必须填写原因"></textarea></div><div class="actions"><button class="btn primary" data-decision="approved">批准并签署</button><button class="btn danger" data-decision="rejected">退回修复</button><button class="btn secondary" data-close>取消</button></div></div>`;
  document.body.append(node); node.querySelector('[data-close]').onclick = () => node.remove();
  node.querySelectorAll('[data-decision]').forEach(button => button.onclick = async () => {
    try {
      await api(`/api/generation-jobs/${jobId}/sign-off`, { method: 'POST', body: JSON.stringify({ decision: button.dataset.decision, reviewer: node.querySelector('#qaReviewer').value, comments: node.querySelector('#qaComments').value }) });
      toast(button.dataset.decision === 'approved' ? 'QA 已签署通过' : '已退回 Agent 修复队列'); node.remove(); await refresh(true);
    } catch (error) { toast(error.message, 'error'); }
  });
}
