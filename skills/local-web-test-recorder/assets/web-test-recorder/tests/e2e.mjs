import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd(); const port = 4187; const base = `http://127.0.0.1:${port}`; const sandbox = await mkdtemp(join(tmpdir(), 'web-test-recorder-e2e-'));
const paths = { data:join(sandbox,'data'), recordings:join(sandbox,'recordings'), artifacts:join(sandbox,'artifacts'), suites:join(sandbox,'test-suites') };
const server = spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:paths.data,RECORDINGS_DIR:paths.recordings,ARTIFACTS_DIR:paths.artifacts,TEST_SUITES_DIR:paths.suites,RECORD_DRY_RUN:'1'},stdio:'pipe'});
async function waitForServer(){for(let i=0;i<60;i+=1){try{if((await fetch(`${base}/api/state`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('server did not start');}
async function request(path,method='GET',body,expected){const response=await fetch(`${base}${path}`,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const json=response.status===204?null:await response.json();if(expected)assert.equal(response.status,expected,JSON.stringify(json));else assert.ok(response.ok,JSON.stringify(json));return json;}

try{
  await waitForServer();
  const plan=await request('/api/plans','POST',{name:'登录回归计划',description:'E2E'});
  let testCase=await request('/api/cases','POST',{name:'搜索流程',editorMode:'visual'});
  await request(`/api/plans/${plan.id}/cases/${testCase.id}`,'POST');
  await access(join(paths.suites,'登录回归计划','搜索流程.spec.js')); await access(join(paths.suites,'登录回归计划','test_搜索流程.py'));

  const source=`import { test } from '@playwright/test';\ntest('test', async ({ page }) => {\n  await page.goto('https://www.youtube.com/');\n  await page.getByRole('combobox', { name: '搜索' }).click();\n  await page.getByRole('combobox', { name: '搜索' }).fill('playright mcp');\n  await page.getByRole('combobox', { name: '搜索' }).press('Enter');\n  await page.goto('https://www.youtube.com/shorts/QXoPPNyC5WQ');\n});\n`;
  const filename='e2e-codegen.spec.js';await writeFile(join(paths.recordings,filename),source);
  testCase=await request(`/api/cases/${testCase.id}/import-codegen`,'POST',{filename,mode:'replace'});
  assert.deepEqual(testCase.steps.map(s=>s.action),['goto','click','fill','press','goto']);assert.equal(testCase.steps[2].locator.primary.name,'搜索');
  assert.match(await readFile(join(paths.suites,'登录回归计划','test_搜索流程.py'),'utf8'),/get_by_role\("combobox", name="搜索"\)/);

  const localSteps=[{id:'goto',kind:'action',action:'goto',url:`${base}/fixtures/interaction.html`,timeoutMs:5000},{id:'fill',kind:'action',action:'fill',locator:{primary:{strategy:'role',value:'combobox',name:'搜索'}},value:'Playwright',timeoutMs:5000},{id:'press',kind:'action',action:'press',locator:{primary:{strategy:'role',value:'combobox',name:'搜索'}},value:'Enter',timeoutMs:5000},{id:'assert',kind:'assertion',assertion:'toHaveText',locator:{primary:{strategy:'role',value:'status'}},expected:'Results for: Playwright',timeoutMs:5000}];
  testCase=await request(`/api/cases/${testCase.id}`,'PUT',{...testCase,steps:localSteps,editorMode:'visual',regenerateSources:true});
  const passed=await request(`/api/cases/${testCase.id}/run`,'POST',{headless:true});assert.equal(passed.status,'passed');assert.equal(passed.steps.length,4);assert.ok(passed.artifacts.trace);

  const failingSteps=[...localSteps,{id:'missing',kind:'action',action:'click',locator:{primary:{strategy:'role',value:'button',name:'不存在的按钮'}},timeoutMs:200}];
  testCase=await request(`/api/cases/${testCase.id}`,'PUT',{...testCase,steps:failingSteps,editorMode:'visual',regenerateSources:true});
  const failed=await request(`/api/cases/${testCase.id}/run`,'POST',{headless:true},422);assert.equal(failed.failedStepIndex,4);assert.match(failed.diagnostic.title,/步骤 5/);assert.match(failed.diagnostic.category,/超时/);assert.ok(failed.artifacts.screenshot);assert.ok(failed.artifacts.trace);

  let codeCase=await request('/api/cases','POST',{name:'代码回放',editorMode:'code'});await request(`/api/plans/${plan.id}/cases/${codeCase.id}`,'POST');
  const code=`import { test, expect } from 'playwright/test';\ntest('code replay', async ({ page }) => {\n  await page.goto('${base}/fixtures/interaction.html');\n  await page.getByRole('combobox', { name: '搜索' }).fill('Code');\n  await page.getByRole('combobox', { name: '搜索' }).press('Enter');\n  await expect(page.getByRole('status')).toHaveText('Results for: Code');\n});\n`;
  codeCase=await request(`/api/cases/${codeCase.id}/source`,'PUT',{language:'javascript',code});
  const codeRun=await request(`/api/cases/${codeCase.id}/run`,'POST',{headless:true});assert.equal(codeRun.status,'passed');assert.equal(codeRun.mode,'code');

  const planRun=await request(`/api/plans/${plan.id}/run`,'POST',{headless:true},422);assert.equal(planRun.summary.total,2);assert.equal(planRun.summary.failed,1);assert.equal(planRun.summary.passed,1);
  const runs=await request('/api/runs');assert.ok(runs.length>=4);const dashboard=await request('/api/dashboard');assert.equal(dashboard.plans,1);assert.equal(dashboard.cases,2);

  await request(`/api/cases/${codeCase.id}/record`,'POST',{complianceMode:true,policyConfirmed:false},400);
  codeCase=await request(`/api/cases/${codeCase.id}`,'PUT',{...codeCase,compliance:{enabled:true,environmentName:'Coupay QA',approvedHosts:'127.0.0.1',approvedAccountRefs:'accounts.e2e',allowlistStatus:'approved',allowlistNotes:'E2E only',humanVerification:true,policyConfirmed:true}});
  const firstRecording=await request(`/api/cases/${codeCase.id}/record`,'POST',{complianceMode:true,policyConfirmed:true,url:`${base}/fixtures/interaction.html`},202);
  assert.equal(firstRecording.status,'dry-run');assert.ok(firstRecording.debugArgs.includes('--channel'));assert.ok(firstRecording.debugArgs.includes('chrome'));assert.ok(firstRecording.debugArgs.includes('--user-data-dir'));assert.ok(firstRecording.debugArgs.includes('--save-storage'));assert.ok(!firstRecording.debugArgs.includes('--load-storage'));
  await writeFile(join(paths.data,'auth',`${codeCase.id}.json`),JSON.stringify({cookies:[],origins:[]}));
  const resumedRecording=await request(`/api/cases/${codeCase.id}/record`,'POST',{complianceMode:true,policyConfirmed:true},202);assert.ok(resumedRecording.debugArgs.includes('--load-storage'));
  const complianceStatus=await request(`/api/cases/${codeCase.id}/compliance-status`);assert.equal(complianceStatus.browserChannel,'chrome');assert.equal(complianceStatus.profileCreated,true);assert.equal(complianceStatus.hasSavedLoginState,true);assert.equal(complianceStatus.allowlistStatus,'approved');

  const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(base);await page.getByRole('heading',{name:'今天的测试状态'}).waitFor();assert.equal(await page.locator('.metric').count(),4);await page.locator('[data-view="cases"]').click();await page.locator(`[data-case="${testCase.id}"]`).click();await page.getByRole('button',{name:'无代码步骤'}).waitFor();assert.equal(await page.locator('#steps .step').count(),5);await page.getByRole('button',{name:'代码编辑'}).click();await page.locator('#codeEditor').waitFor();await page.getByRole('button',{name:'配置与数据'}).click();await page.getByRole('heading',{name:'使用本机正式 Chrome 和独立测试身份'}).waitFor();assert.ok(await page.locator('#complianceState').innerText());await page.getByRole('button',{name:'开始录制'}).click();await page.locator('[data-mode="compliance"]').click();await page.locator('#recordPolicy').waitFor();await page.getByRole('button',{name:'取消'}).click();await page.locator('[data-view="runs"]').click();assert.ok(await page.locator('.run-row').count()>=4);await browser.close();

  await request(`/api/runs/${failed.id}`,'DELETE');assert.ok(!(await request('/api/runs')).some(x=>x.id===failed.id));
  console.log('E2E: plans, JS/Python, import, replay, diagnostics, artifacts, dashboard, compliance Chrome/Profile/auth state, and run CRUD passed');
}finally{server.kill('SIGTERM');await rm(sandbox,{recursive:true,force:true});}
