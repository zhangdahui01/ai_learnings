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

export function openGenerationDialog({ item, knowledge, runtime, api, esc, toast, refresh, lines }) {
  const ready = knowledge.filter(source => source.graphReady && source.graph?.status === 'ready');
  const node = document.createElement('div');
  node.className = 'modal-backdrop';
  node.innerHTML = `<div class="modal bdd-generation-modal">
    <h2>生成、回放与 QA 验收</h2>
    <div class="generation-gates"><div class="pass">✓ BDD 已 QA 批准</div><div class="${ready.length ? 'pass' : 'fail'}">${ready.length ? '✓' : '✕'} Repo 知识图谱 ${ready.length ? 'READY' : '缺失'}</div></div>
    <div class="notice"><b>运行环境：</b>${esc(runtime.label)}。平台创建任务，当前 AI Agent 负责生成或修复；平台负责真实回放、错误证据和 QA 门禁。</div>
    <div class="field"><label>最终脚本写入的目标 Repo（单选、必需）</label><select id="generationTargetGraph">${ready.map(source => `<option value="${esc(source.id)}">${esc(source.name)} · ${esc(source.repoPath)}</option>`).join('')}</select><small>specs/ 和 tests/ 只写入这里；其他 Repo 仅作为只读参考证据。</small></div>
    <div class="field"><label>参考知识图谱（多选、至少一个）</label><div class="knowledge-selector">${ready.map((source,index) => `<label class="${index===0?'target-graph':''}" data-graph-option="${esc(source.id)}"><input type="checkbox" data-generation-graph value="${esc(source.id)}" checked><span><b>${esc(source.name)}</b><small>${esc(source.repoPath)} · ${esc(source.graph?.provider||'local graph')}</small></span></label>`).join('')}</div><small>可以同时参考开发 Repo、Page Object/组件 Repo 和既有 UI 自动化框架。目标 Repo 会始终被选中。</small></div>
    <div class="field"><label>生成后如何回放</label><select id="replayMode"><option value="auto">自动回放（推荐）</option><option value="manual">由 QA 手工点击回放</option></select><small>自动回放失败后可进入 Agent 修复队列；每次修复提交后再次自动回放。</small></div>
    <div class="field-grid"><label class="check-row"><input type="checkbox" id="autoFix" checked> 失败后进入自动修复队列</label><div class="field"><label>最大回放 / 修复轮次</label><select id="maxAttempts">${[1,2,3,4,5,6,8,10].map(value => `<option ${value === 5 ? 'selected' : ''}>${value}</option>`).join('')}</select></div></div>
    <label class="check-row"><input type="checkbox" id="useGenerator" checked> 使用 Playwright Generator Agent</label>
    <div class="field"><label>可选：Playwright Codegen 原生脚本（每行一个绝对路径）</label><textarea id="generatorRecordings" placeholder="/repo/recordings/coupay-login.spec.js"></textarea><small>复杂 iframe、支付键盘和弹窗可以用录制脚本补充证据。</small></div>
    <div class="qa-gate-copy"><b>最终门禁</b><span>回放通过 ≠ 正式通过。任务会停在“等待 QA 签署”，必须由 QA 填写签署人并批准。</span></div>
    <div class="output-preview"><b>输出约定</b><code>specs/${esc(item.tenant.toLowerCase())}/${esc(item.region.toLowerCase())}/${esc(item.scenarioId)}.md</code><code>tests/${esc(item.tenant.toLowerCase())}/${esc(item.region.toLowerCase())}/${esc(item.scenarioId)}.spec.ts</code></div>
    <div class="actions"><button class="btn primary" id="triggerGeneration" ${ready.length ? '' : 'disabled'}>创建生成与验证任务</button><button class="btn secondary" data-close>取消</button></div><div id="generationResult"></div>
  </div>`;
  document.body.append(node);
  node.querySelector('[data-close]').onclick = () => node.remove();
  const syncTargetGraph = () => {
    const targetId = node.querySelector('#generationTargetGraph').value;
    node.querySelectorAll('[data-graph-option]').forEach(option => option.classList.toggle('target-graph', option.dataset.graphOption === targetId));
    const targetCheckbox = [...node.querySelectorAll('[data-generation-graph]')].find(input => input.value === targetId);
    if (targetCheckbox) { targetCheckbox.checked = true; targetCheckbox.disabled = true; }
    node.querySelectorAll('[data-generation-graph]').forEach(input => { if (input.value !== targetId) input.disabled = false; });
  };
  node.querySelector('#generationTargetGraph')?.addEventListener('change', syncTargetGraph); syncTargetGraph();
  node.querySelector('#triggerGeneration').onclick = async () => {
    try {
      const knowledgeSourceIds = [...node.querySelectorAll('[data-generation-graph]:checked')].map(input => input.value);
      if (!knowledgeSourceIds.length) throw new Error('至少选择一个 READY 知识图谱');
      const job = await api(`/api/bdd-cases/${item.id}/generation-jobs`, { method: 'POST', body: JSON.stringify({
        targetKnowledgeSourceId: node.querySelector('#generationTargetGraph').value,
        knowledgeSourceIds,
        replayMode: node.querySelector('#replayMode').value,
        autoFix: node.querySelector('#autoFix').checked,
        maxAttempts: Number(node.querySelector('#maxAttempts').value),
        useGeneratorAgent: node.querySelector('#useGenerator').checked,
        recordings: lines(node.querySelector('#generatorRecordings').value),
      }) });
      node.querySelector('#generationResult').innerHTML = `<div class="notice success"><strong>任务已创建</strong><p>${esc(STATUS_LABELS[job.status] || job.status)}</p><p>目标脚本：${esc(job.outputs.testPath || job.outputs.testRelativePath)}</p></div>`;
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
      return `<article class="job-row" data-generation-job="${esc(job.id)}"><div class="split"><div><h3>${esc(caseItem?.scenarioId || job.bddCaseId)}</h3><p>${esc(job.generator?.engine || '历史任务')} · ${esc(job.runtime?.label || '历史任务')}</p><small>${esc(job.outputs?.testRelativePath || '历史任务未记录输出路径')}</small></div><span class="badge ${statusClass(job.status)}">${esc(STATUS_LABELS[job.status] || job.status)}</span></div>
        ${pipeline(job)}
        <div class="job-policy"><span>${validation.replayMode === 'manual' ? '手工回放' : '自动回放'}</span><span>${validation.autoFix === false ? '不自动修复' : '自动修复'}</span><span>${validation.attemptCount || 0} / ${validation.maxAttempts || 5} 次</span><span>QA：${esc(qa.status || 'pending')}</span></div>
        ${job.status === 'fix-queued' ? `<div class="notice warning"><b>等待当前 AI Agent 修复</b><p>Agent 应读取最新错误、Trace/截图/录像，最小化修改脚本并重新提交；平台随后继续回放。</p><details><summary>修复 Prompt</summary><pre>${esc(job.fixPrompt || '')}</pre></details></div>` : ''}
        <div class="actions"><button class="btn small primary" data-replay="${esc(job.id)}" ${canReplay ? '' : 'disabled'}>▶ 开始回放</button><button class="btn small secondary" data-sign="${esc(job.id)}" ${job.status === 'awaiting-qa' ? '' : 'disabled'}>QA 签署</button></div>
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
