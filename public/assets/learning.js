const learning = {
  user: null, course: null, completed: [], lessonNotes: {}, assignmentDrafts: {}, currentLessonId: null, currentAssignment: null,
  canRun: false, config: {}, drafts: new Map(), records: new Map(), running: false, assignmentTestPassed: false
};
const learningLanguage = localStorage.getItem('polynomial-language') === 'en' ? 'en' : 'zh';
const le = id => document.getElementById(id);

function allLessons() { return learning.course.chapters.flatMap(chapter => chapter.lessons.map(lesson => ({ ...lesson, chapter }))); }
function assignmentIds() { return allLessons().map(item => item.assignment?.id).filter(Boolean); }
function currentLesson() { return allLessons().find(item => item.id === learning.currentLessonId); }

async function initLearningLab() {
  le('runOutput').textContent = learningLanguage === 'en' ? 'Program output will appear here.' : '运行结果会显示在这里。';
  const user = await loadAccount();
  learning.user = user;
  const [courseData, progressData] = await Promise.all([request('/api/learning/course'), request('/api/learning/progress')]);
  learning.course = courseData.course; learning.canRun = courseData.canRun; learning.config = courseData.config || {};
  if (le('courseTitle')) le('courseTitle').textContent = learning.course.title;
  learning.completed = progressData.progress?.completedLessons || [];
  learning.lessonNotes = progressData.progress?.lessonNotes || {};
  learning.assignmentDrafts = progressData.progress?.assignmentDrafts || {};
  const params = new URLSearchParams(location.search);
  const courseSelected = params.get('course') === learning.course.id || params.get('lab') === '1';
  le('courseCatalog').hidden = courseSelected;
  le('courseView').hidden = !courseSelected;
  const firstLessonId = allLessons()[0]?.id;
  learning.currentLessonId = null;
  renderDirectory(); showLesson(firstLessonId); showLimits();
  if (learning.canRun) await refreshNotebookStatus(); else setWorkspaceAccess(false, '未开放代码运行权限');
  await Promise.all(assignmentIds().map(id => loadRecords(id, false)));
  updateProgress();
  if (params.get('lab') === '1') le('codeWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  le('courseMenu').onclick = () => le('chapterList').classList.toggle('collapsed');
  le('openDraftLibrary').onclick = openDraftLibrary;
  le('exportAllDrafts').onclick = exportAllDrafts;
  le('runCode').onclick = runCode;
  le('resetCode').onclick = resetEditor;
  le('openNotebook').onclick = openFullNotebook;
  le('stopNotebook').onclick = stopNotebook;
  le('codeEditor').addEventListener('keydown', event => {
    if (event.key === 'Tab') { event.preventDefault(); const editor = event.currentTarget, start = editor.selectionStart, end = editor.selectionEnd; editor.setRangeText('    ', start, end, 'end'); }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); runCode(); }
  });
  document.querySelector('#completedCount').title = `当前账号：${user.displayName}`;
}

function renderDirectory() {
  le('chapterList').innerHTML = learning.course.chapters.map(chapter => `<details class="course-chapter" ${chapter.lessons.some(item => item.id === learning.currentLessonId) ? 'open' : ''}><summary><div><span>CHAPTER ${chapter.number}</span><strong>${esc(chapter.title)}</strong></div><small>${chapter.lessons.length} 节</small></summary><div class="chapter-lessons">${chapter.lessons.map((lesson, index) => `<button class="lesson-link ${lesson.id === learning.currentLessonId ? 'active' : ''}" data-lesson="${lesson.id}"><span class="lesson-state">${learning.completed.includes(lesson.id) ? '✓' : '○'}</span><span>${index + 1}. ${esc(lesson.title)}</span></button>`).join('')}</div></details>`).join('');
  document.querySelectorAll('[data-lesson]').forEach(button => button.onclick = () => showLesson(button.dataset.lesson));
}

function draftEntries() {
  return allLessons().filter(lesson => lesson.assignment && String(learning.assignmentDrafts[lesson.assignment.id] || '').trim()).map(lesson => ({ lesson, assignment: lesson.assignment, code: learning.assignmentDrafts[lesson.assignment.id] }));
}

function openDraftLibrary() {
  renderDraftLibrary();
  le('draftLibraryDialog')?.showModal();
}

function renderDraftLibrary() {
  const entries = draftEntries(), list = le('draftLibraryList');
  le('draftLibraryCount').textContent = `${entries.length} 份草稿`;
  le('exportAllDrafts').disabled = entries.length === 0;
  list.innerHTML = entries.length ? entries.map(({ lesson, assignment, code }) => `<article class="draft-library-item"><div class="draft-library-meta"><div><span>第 ${lesson.chapter.number} 章 · ${esc(lesson.title)}</span><strong>${esc(assignment.title)}</strong></div><div class="draft-library-actions"><button class="button secondary" data-open-draft="${assignment.id}" type="button">继续编辑</button><button class="button secondary" data-export-draft="${assignment.id}" type="button">导出 .py</button><button class="button danger" data-delete-draft="${assignment.id}" type="button">删除草稿</button></div></div><details><summary>查看保存的代码</summary><pre><code>${esc(code)}</code></pre></details></article>`).join('') : '<div class="empty">当前账号还没有保存作业草稿。进入作业后点击“保存草稿”，这里就会出现记录。</div>';
  list.querySelectorAll('[data-open-draft]').forEach(button => button.onclick = () => {
    const entry = entries.find(item => item.assignment.id === button.dataset.openDraft); if (!entry) return;
    le('draftLibraryDialog').close(); showLesson(entry.lesson.id); setTimeout(() => le('assignmentPanel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  });
  list.querySelectorAll('[data-export-draft]').forEach(button => button.onclick = () => {
    const entry = entries.find(item => item.assignment.id === button.dataset.exportDraft); if (!entry) return;
    downloadText(`${entry.assignment.id}-solution.py`, entry.code, 'text/x-python;charset=utf-8');
  });
  list.querySelectorAll('[data-delete-draft]').forEach(button => button.onclick = () => deleteAssignmentDraft(button.dataset.deleteDraft, button));
}

async function deleteAssignmentDraft(assignmentId, button) {
  const entry = draftEntries().find(item => item.assignment.id === assignmentId); if (!entry) return;
  if (!confirm('确定删除这份作业草稿吗？删除后不能恢复。')) return;
  button.disabled = true; button.textContent = '正在删除…';
  delete learning.assignmentDrafts[assignmentId];
  if (learning.currentAssignment?.id === assignmentId && le('assignmentEditor')) {
    le('assignmentEditor').value = learning.currentAssignment.starterCode;
    invalidateAssignmentTest();
  }
  try { await saveProgress(); renderDraftLibrary(); }
  catch (error) { learning.assignmentDrafts[assignmentId] = entry.code; if (learning.currentAssignment?.id === assignmentId && le('assignmentEditor')) le('assignmentEditor').value = entry.code; alert(error.message); renderDraftLibrary(); }
}

function exportAllDrafts() {
  const entries = draftEntries(); if (!entries.length) return;
  const payload = { version: 1, courseId: learning.course.id, courseTitle: learning.course.title, username: learning.user?.username || null, exportedAt: new Date().toISOString(), drafts: entries.map(({ lesson, assignment, code }) => ({ assignmentId: assignment.id, assignmentTitle: assignment.title, lessonId: lesson.id, lessonTitle: lesson.title, chapter: lesson.chapter.number, code })) };
  downloadText(`python-course-drafts-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
}

function downloadText(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type })), link = document.createElement('a');
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0);
}

function showLesson(id) {
  if (learning.currentLessonId && le('codeEditor')) learning.drafts.set(learning.currentLessonId, le('codeEditor').value);
  if (learning.currentAssignment && le('assignmentEditor')) learning.assignmentDrafts[learning.currentAssignment.id] = le('assignmentEditor').value;
  learning.currentLessonId = id;
  const lesson = currentLesson(); if (!lesson) return;
  learning.currentAssignment = lesson.assignment || null;
  learning.assignmentTestPassed = false;
  const blocks = lesson.body.map((block, index) => {
    if (block.type === 'code') return `<div class="lesson-code"><button class="try-code" data-example="${index}" type="button">在右侧运行</button><pre><code>${esc(block.code)}</code></pre></div>`;
    if (block.type === 'tip') return `<div class="lesson-tip">${esc(block.text)}</div>`;
    if (block.type === 'heading') return `<section class="lesson-topic"><h3>${esc(block.title)}</h3><p>${esc(block.text)}</p></section>`;
    return `<div class="lesson-block"><p>${esc(block.text)}</p></div>`;
  }).join('');
  const assignment = lesson.assignment ? assignmentHtml(lesson.assignment) : '';
  const lessons = allLessons(), position = lessons.findIndex(item => item.id === id), previous = lessons[position - 1], next = lessons[position + 1];
  le('lessonStage').innerHTML = `<div class="lesson-kicker"><span>第 ${lesson.chapter.number} 章</span><span>预计 ${lesson.duration} 分钟</span></div><h2>${esc(lesson.title)}</h2><p class="lesson-summary">${esc(lesson.summary)}</p>${blocks}${assignment}<div class="lesson-footer"><label class="lesson-notes-label" for="lessonNotes"><strong>我的课程笔记</strong><small>等待完善</small></label><textarea class="lesson-notes" id="lessonNotes" rows="4" placeholder="笔记按当前账号和课节保存">${esc(learning.lessonNotes[id] || '')}</textarea><button class="button secondary" id="saveLessonNotes" type="button">保存笔记</button><button class="button" id="toggleLesson" type="button">${learning.completed.includes(id) ? '取消完成标记' : '标记本节已完成'}</button><div class="lesson-navigation"><button class="button secondary" id="previousLesson" type="button" ${previous ? '' : 'disabled'}>← ${previous ? esc(previous.title) : '已经是第一节'}</button><button class="button secondary" id="nextLesson" type="button" ${next ? '' : 'disabled'}>${next ? esc(next.title) : '已经是最后一节'} →</button></div></div>`;
  renderDirectory();
  document.querySelectorAll('[data-example]').forEach(button => button.onclick = () => { const block = lesson.body[Number(button.dataset.example)]; setEditor(block.code, `${lesson.title} · 示例`); le('codeWorkspace').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  le('saveLessonNotes').onclick = saveLessonNotes;
  le('toggleLesson').onclick = toggleLesson;
  le('previousLesson').onclick = () => previous && showLesson(previous.id);
  le('nextLesson').onclick = () => next && showLesson(next.id);
  if (lesson.assignment) {
    le('assignmentEditor').addEventListener('input', invalidateAssignmentTest);
    le('assignmentEditor').addEventListener('keydown', event => { if (event.key === 'Tab') { event.preventDefault(); const editor = event.currentTarget, start = editor.selectionStart, end = editor.selectionEnd; editor.setRangeText('    ', start, end, 'end'); } });
    le('saveAssignmentDraft').onclick = saveAssignmentDraft;
    le('resetAssignmentCode').onclick = resetAssignmentCode;
    le('testAssignment').onclick = testAssignment;
    le('submitAssignment').onclick = submitAssignment;
    le('showCommunityResults').onclick = openCommunityResults;
    le('clearAssignmentRecords').onclick = clearAssignmentRecords;
    loadRecords(lesson.assignment.id, true);
  }
  resetEditor(true);
}

function assignmentHtml(assignment) {
  const saved = learning.assignmentDrafts[assignment.id];
  const legacyDraft = saved && !/\bclass\s+Solution\b/.test(saved);
  const code = saved && !legacyDraft ? saved : assignment.starterCode;
  const examples = (assignment.examples || []).map((item, index) => `<div class="assignment-example"><strong>示例 ${index + 1}</strong><code>调用：${esc(item.call)}</code><code>返回：${esc(item.output)}</code><p>${esc(item.explanation || '')}</p></div>`).join('');
  return `<section class="lesson-assignment" id="assignmentPanel"><div class="assignment-head"><div><span class="assignment-badge">CLASS SOLUTION ASSIGNMENT</span><h3>${esc(assignment.title)}</h3><p>${esc(assignment.prompt)}</p><div class="assignment-rule">必须保留 <code>class Solution</code>、指定的方法名称、<code>self</code> 和参数。只在方法中补充逻辑，并用 <code>return</code> 返回答案；不要读取输入、调用 <code>print()</code> 代替返回值或写死测试数据。</div>${legacyDraft ? '<div class="assignment-migration">检测到旧函数格式草稿，已载入新的 Solution 类模板。旧草稿仍保留到你点击“保存草稿”。</div>' : ''}</div></div>${examples ? `<div class="assignment-examples">${examples}</div>` : ''}<div class="assignment-editor-shell"><div class="assignment-editor-head"><span>Solution.py</span><small>独立作业编辑区 · 严格使用 class Solution</small></div><textarea id="assignmentEditor" class="assignment-editor" spellcheck="false">${esc(code)}</textarea><div class="assignment-test-result" id="assignmentTestResult"><span>修改代码后请先测试。通过页面测试后才能正式提交。</span></div><div class="assignment-actions"><button class="button secondary" id="saveAssignmentDraft" type="button">保存草稿</button><button class="button secondary" id="resetAssignmentCode" type="button">重置代码</button><button class="button secondary" id="testAssignment" type="button" ${learning.canRun ? '' : 'disabled'}>测试</button><div class="assignment-submit-group"><button class="button assignment-submit" id="submitAssignment" type="button" disabled>提交</button><details class="submit-privacy"><summary title="选择成绩可见性">▾</summary><div><label><input type="radio" name="submissionVisibility" value="private" checked><span>不公开成绩和答案</span></label><label><input type="radio" name="submissionVisibility" value="public"><span>公开成绩、时间、内存和答案代码</span></label></div></details></div></div></div><div class="submission-records"><div class="records-title"><div><strong>我的作业记录</strong><small>可以修改每次记录的公开状态，或清空当前作业的个人记录</small></div><div class="records-actions"><button class="button secondary" id="clearAssignmentRecords" type="button">清空我的记录</button><button class="button secondary community-results-button" id="showCommunityResults" type="button">查看其他人的结果</button></div></div><div class="record-list" id="assignmentRecords"><div class="empty">正在读取记录…</div></div></div><dialog class="community-results-dialog" id="communityResultsDialog"><div class="community-dialog-head"><div><span class="assignment-badge">PUBLIC SOLUTIONS</span><h3>其他人的公开结果</h3><p>这里只显示由答题者主动选择公开的成绩和答案；管理员可以删除不适合公开的记录。</p></div><form method="dialog"><button class="dialog-close" aria-label="关闭" type="submit">×</button></form></div><div class="community-result-list" id="communityResultList"></div></dialog></section>`;
}

function setEditor(code, context) {
  le('codeEditor').value = code;
  le('editorContext').textContent = context;
  le('runOutput').textContent = '运行结果会显示在这里。';
  le('runMetrics').innerHTML = '';
}

function resetEditor(useDraft = true) {
  const lesson = currentLesson(); if (!lesson) return;
  const saved = useDraft ? learning.drafts.get(lesson.id) : null;
  const firstExample = lesson.body.find(block => block.type === 'code')?.code || 'print("开始练习")';
  const code = saved ?? firstExample;
  setEditor(code, `${lesson.title} · 示例与自由练习`);
}

async function runCode() {
  if (!learning.canRun) return showWorkspaceError('管理员尚未为此账号开放代码运行权限。');
  if (learning.running) return;
  learning.running = true; le('runCode').disabled = true; le('runCode').textContent = '运行中…'; le('workspaceNotice').textContent = '正在启动或连接账号隔离环境。';
  try {
    const data = await request('/api/learning/run', { method: 'POST', body: JSON.stringify({ code: le('codeEditor').value }) });
    showRunResult(data.result); setWorkspaceAccess(true, '正在运行');
  } catch (error) { showWorkspaceError(error.message); }
  finally { learning.running = false; le('runCode').disabled = false; le('runCode').textContent = '运行代码'; }
}

function invalidateAssignmentTest() {
  learning.assignmentTestPassed = false;
  const button = le('submitAssignment'); if (button) button.disabled = true;
  button?.closest('.assignment-submit-group')?.classList.remove('ready');
  const result = le('assignmentTestResult'); if (result) result.innerHTML = '<span>代码已经修改，请重新测试后再提交。</span>';
}

async function saveAssignmentDraft() {
  const assignment = learning.currentAssignment; if (!assignment) return;
  learning.assignmentDrafts[assignment.id] = le('assignmentEditor').value;
  const button = le('saveAssignmentDraft'); button.disabled = true; button.textContent = '保存中…';
  try { await saveProgress(); button.textContent = '已保存'; }
  catch (error) { button.textContent = '保存失败'; le('assignmentTestResult').innerHTML = `<span class="test-fail">${esc(error.message)}</span>`; }
  finally { setTimeout(() => { if (le('saveAssignmentDraft')) { le('saveAssignmentDraft').disabled = false; le('saveAssignmentDraft').textContent = '保存草稿'; } }, 900); }
}

async function resetAssignmentCode() {
  const assignment = learning.currentAssignment; if (!assignment) return;
  if (!confirm('确定恢复这道作业的初始代码模板吗？当前编辑区内容会被覆盖。')) return;
  const editor = le('assignmentEditor'), button = le('resetAssignmentCode');
  editor.value = assignment.starterCode;
  learning.assignmentDrafts[assignment.id] = assignment.starterCode;
  invalidateAssignmentTest();
  button.disabled = true; button.textContent = '正在重置…';
  try { await saveProgress(); button.textContent = '已重置'; editor.focus(); }
  catch (error) { button.textContent = '重置失败'; le('assignmentTestResult').innerHTML = `<span class="test-fail">${esc(error.message)}</span>`; }
  finally { setTimeout(() => { if (le('resetAssignmentCode')) { le('resetAssignmentCode').disabled = false; le('resetAssignmentCode').textContent = '重置代码'; } }, 900); }
}

async function testAssignment() {
  const assignment = learning.currentAssignment; if (!assignment || learning.running) return;
  const code = le('assignmentEditor').value, button = le('testAssignment');
  learning.running = true; learning.assignmentTestPassed = false; le('submitAssignment').disabled = true; button.disabled = true; button.textContent = '测试中…';
  le('assignmentTestResult').innerHTML = '<span>正在使用服务器生成的测试数据运行函数…</span>';
  try {
    const data = await request(`/api/learning/assignments/${assignment.id}/test`, { method: 'POST', body: JSON.stringify({ code }) });
    learning.assignmentTestPassed = data.result.success;
    le('submitAssignment').disabled = !data.result.success;
    le('submitAssignment').closest('.assignment-submit-group').classList.toggle('ready', data.result.success);
    renderAssignmentTest(data.result, data.cases || []);
  } catch (error) { le('assignmentTestResult').innerHTML = `<span class="test-fail">${esc(error.message)}</span>`; }
  finally { learning.running = false; button.disabled = false; button.textContent = '测试'; }
}

function renderAssignmentTest(result, cases) {
  const status = result.success ? `<strong class="test-pass">测试通过 · ${result.passed}/${result.total}</strong>` : `<strong class="test-fail">测试未通过 · ${result.passed}/${result.total}</strong>`;
  const metrics = `<span>${Number(result.runtimeMs).toFixed(2)} ms</span><span>${formatMemory(result.memoryKB)}</span>`;
  const actualByTest = new Map((result.caseResults || []).map(item => [Number(item.test), item.actualRepr]));
  const revealWhitespace = value => String(value).replace(/ /g, '·').replace(/\t/g, '⇥').replace(/\n/g, '↵\n');
  const rows = cases.map(item => { const actual = actualByTest.has(item.number) ? actualByTest.get(item.number) : '执行中断，未得到返回值'; const actualLabel = actual === 'None' ? 'None（没有返回值）' : revealWhitespace(actual); return `<div class="test-case"><b>测试 ${item.number}</b><code>参数：${esc(revealWhitespace(JSON.stringify(item.args)))}</code><code class="test-actual">实际返回：${esc(actualLabel)}</code><code>期望返回：${esc(revealWhitespace(JSON.stringify(item.expected)))}</code></div>`; }).join('');
  const error = result.error ? `<pre>${esc(result.error)}</pre>` : '';
  le('assignmentTestResult').innerHTML = `<div class="test-summary">${status}<div>${metrics}</div></div>${error}<div class="test-cases">${rows}</div>`;
}

async function submitAssignment() {
  const assignment = learning.currentAssignment; if (!assignment || learning.running || !learning.assignmentTestPassed) return;
  const button = le('submitAssignment'), code = le('assignmentEditor').value;
  const visibility = document.querySelector('[name="submissionVisibility"]:checked')?.value || 'private';
  learning.running = true; button.disabled = true; button.textContent = '提交中…';
  try {
    const data = await request(`/api/learning/assignments/${assignment.id}/submit`, { method: 'POST', body: JSON.stringify({ code, visibility }) });
    learning.assignmentDrafts[assignment.id] = code; await saveProgress();
    renderAssignmentTest(data.result, []);
    if (data.result.success && !learning.completed.includes(learning.currentLessonId)) { learning.completed.push(learning.currentLessonId); await saveProgress(); if (le('toggleLesson')) le('toggleLesson').textContent = '取消完成标记'; }
    await loadRecords(assignment.id, true); updateProgress();
  } catch (error) { le('assignmentTestResult').innerHTML = `<span class="test-fail">${esc(error.message)}</span>`; }
  finally { learning.running = false; button.disabled = !learning.assignmentTestPassed; button.textContent = '提交'; }
}

function showRunResult(result) {
  const output = [result.output, result.error].filter(Boolean).join('\n');
  le('runOutput').textContent = output || (result.success ? '程序运行完成，没有产生标准输出。' : '程序未通过评测。');
  le('runMetrics').innerHTML = `<span>${Number(result.runtimeMs).toFixed(2)} ms</span><span>${formatMemory(result.memoryKB)}</span>${result.total ? `<span>${result.passed}/${result.total} 测试</span>` : ''}`;
  le('workspaceNotice').textContent = result.error || '';
  le('workspaceNotice').style.color = result.success ? 'var(--accent2)' : 'var(--danger)';
}

function formatMemory(kb) {
  const value = Number(kb) >= 1024 ? `${(Number(kb) / 1024).toFixed(1)} MB` : `${Number(kb || 0)} KB`;
  return `${value} ${window.I18N?.language === 'en' ? 'peak memory' : '峰值内存'}`;
}
function showWorkspaceError(message) { le('workspaceNotice').style.color = 'var(--danger)'; le('workspaceNotice').textContent = message; le('runOutput').textContent = message; }

async function loadRecords(assignmentId, render = true) {
  try { const records = await request(`/api/learning/assignments/${assignmentId}/records`); learning.records.set(assignmentId, records); if (render && learning.currentAssignment?.id === assignmentId) renderRecords(records); }
  catch (error) { if (render && le('assignmentRecords')) le('assignmentRecords').innerHTML = `<div class="notice">${esc(error.message)}</div>`; }
}

function renderRecords(records) {
  const own = records.own || [], shared = records.shared || [];
  const rows = own.map(item => recordRow(item, '我的提交'));
  le('assignmentRecords').innerHTML = rows.length ? rows.join('') : '<div class="empty">还没有提交记录</div>';
  const communityButton = le('showCommunityResults');
  if (communityButton) communityButton.textContent = `查看其他人的结果${shared.length ? `（${shared.length}）` : ''}`;
  const clearButton = le('clearAssignmentRecords');
  if (clearButton) { clearButton.disabled = own.length === 0; clearButton.textContent = '清空我的记录'; }
  if (le('communityResultsDialog')?.open) renderCommunityResults(shared);
  document.querySelectorAll('[data-record-visibility]').forEach(select => select.onchange = async () => {
    select.disabled = true;
    try { await request(`/api/learning/submissions/${select.dataset.recordVisibility}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibility: select.value }) }); await loadRecords(learning.currentAssignment.id, true); }
    catch (error) { alert(error.message); await loadRecords(learning.currentAssignment.id, true); }
  });
}

async function clearAssignmentRecords() {
  const assignment = learning.currentAssignment; if (!assignment) return;
  if (!confirm('确定清空当前作业的全部个人提交记录吗？此操作不能撤销，作业代码草稿不会删除。')) return;
  const button = le('clearAssignmentRecords'); button.disabled = true; button.textContent = '正在清空…';
  try { await request(`/api/learning/assignments/${assignment.id}/records`, { method: 'DELETE' }); await loadRecords(assignment.id, true); updateProgress(); }
  catch (error) { alert(error.message); button.disabled = false; button.textContent = '清空我的记录'; }
}

function openCommunityResults() {
  const records = learning.records.get(learning.currentAssignment?.id) || { shared: [] };
  renderCommunityResults(records.shared || []);
  le('communityResultsDialog')?.showModal();
}

function renderCommunityResults(shared) {
  const list = le('communityResultList'); if (!list) return;
  list.innerHTML = shared.length ? shared.map((item, index) => `<article class="community-result"><div class="community-result-meta"><div><strong data-i18n-user>${esc(item.displayName)}</strong><small><span data-i18n-user>@${esc(item.username)}</span> · ${new Date(item.submittedAt).toLocaleString(window.I18N?.locale || 'zh-CN')}</small></div><div class="record-metrics"><span class="${item.success ? 'record-pass' : 'record-fail'}">${item.success ? 'PASS' : 'RETRY'}</span><span>${Number(item.runtimeMs).toFixed(2)} ms</span><span>${formatMemory(item.memoryKB).replace(/峰值内存|peak memory/g, '').trim()}</span>${learning.user?.role === 'admin' ? `<button class="delete-public-answer" data-delete-public-answer="${item.id}" type="button">删除公开答案</button>` : ''}</div></div><details ${index === 0 ? 'open' : ''}><summary>查看答案代码</summary><pre><code>${esc(item.code || (window.I18N?.language === 'en' ? '# No solution code is available for this public record' : '# 此公开记录没有可显示的代码'))}</code></pre></details></article>`).join('') : '<div class="empty community-empty">还没有用户公开这道作业的结果。</div>';
  list.querySelectorAll('[data-delete-public-answer]').forEach(button => button.onclick = async () => {
    if (!confirm('确定以管理员身份删除这条公开答案吗？此操作不能撤销。')) return;
    button.disabled = true; button.textContent = '正在删除…';
    try { await request(`/api/learning/submissions/${button.dataset.deletePublicAnswer}`, { method: 'DELETE' }); await loadRecords(learning.currentAssignment.id, true); }
    catch (error) { alert(error.message); button.disabled = false; button.textContent = '删除公开答案'; }
  });
}

function recordRow(item, label) {
  return `<div class="submission-row"><div><strong>${esc(label)} · ${item.success ? '通过' : '未通过'}</strong><small>${new Date(item.submittedAt).toLocaleString(window.I18N?.locale || 'zh-CN')} · ${item.passed}/${item.total} 个测试</small></div><div class="record-metrics"><span class="${item.success ? 'record-pass' : 'record-fail'}">${item.success ? 'PASS' : 'RETRY'}</span><span>${Number(item.runtimeMs).toFixed(2)} ms</span><span>${formatMemory(item.memoryKB).replace(/峰值内存|peak memory/g, '').trim()}</span>${item.own ? `<label class="record-visibility-label"><span>可见性</span><select data-record-visibility="${item.id}" aria-label="修改记录公开模式"><option value="private" ${item.visibility === 'private' ? 'selected' : ''}>隐藏</option><option value="public" ${item.visibility === 'public' ? 'selected' : ''}>公开</option></select></label>` : '<span>已公开</span>'}</div></div>`;
}

async function saveLessonNotes() {
  learning.lessonNotes[learning.currentLessonId] = le('lessonNotes').value;
  await saveProgress(); le('saveLessonNotes').textContent = '已保存'; setTimeout(() => { if (le('saveLessonNotes')) le('saveLessonNotes').textContent = '保存笔记'; }, 1200);
}

async function toggleLesson() {
  const id = learning.currentLessonId;
  learning.completed = learning.completed.includes(id) ? learning.completed.filter(item => item !== id) : [...learning.completed, id];
  learning.lessonNotes[id] = le('lessonNotes').value; await saveProgress(); showLesson(id); updateProgress();
}

async function saveProgress() { await request('/api/learning/progress', { method: 'PUT', body: JSON.stringify({ completedLessons: learning.completed, lessonNotes: learning.lessonNotes, assignmentDrafts: learning.assignmentDrafts }) }); }

function updateProgress() {
  if (!learning.course) return;
  const total = allLessons().length, percent = total ? Math.round(learning.completed.length / total * 100) : 0;
  const passed = new Set(); for (const [id, records] of learning.records) if ((records.own || []).some(item => item.success)) passed.add(id);
  le('completedCount').textContent = learning.completed.length; le('passedCount').textContent = passed.size; le('coursePercent').textContent = `${percent}%`;
  le('courseProgress').value = percent; le('progressLabel').textContent = `${learning.completed.length} / ${total} 课节 · ${passed.size} / ${assignmentIds().length} 作业`;
  renderDirectory();
}

function showLimits() {
  const cpu = (Number(learning.config.cpuMilli || 0) / 1000).toFixed(learning.config.cpuMilli % 1000 ? 2 : 0);
  le('notebookLimits').innerHTML = `<span>${learning.config.memoryMB || '-'} MB</span><span>${cpu} CPU</span><span>${learning.config.storageMB || '-'} MB 存档</span><span>${learning.config.idleMinutes || '-'} 分钟闲置停止</span>`;
}

function setWorkspaceAccess(running, message) {
  le('notebookDot').classList.toggle('online', running); le('notebookStatus').textContent = message;
  le('runCode').disabled = !learning.canRun; le('openNotebook').disabled = !learning.canRun; le('stopNotebook').disabled = !running;
}

async function refreshNotebookStatus() {
  try { const data = await request('/api/notebook/status'); setWorkspaceAccess(Boolean(data.running), data.running ? '环境正在运行' : '将在运行代码时启动'); }
  catch (error) { setWorkspaceAccess(false, '环境暂时不可用'); showWorkspaceError(error.message); }
}

async function openFullNotebook() {
  if (!learning.canRun) return;
  const target = window.open('', '_blank');
  le('workspaceNotice').textContent = '正在准备完整 JupyterLab…';
  try { await request('/api/notebook/start', { method: 'POST' }); if (target) target.location = '/python/session/lab'; else location.href = '/python/session/lab'; setWorkspaceAccess(true, '环境正在运行'); }
  catch (error) { if (target) target.close(); showWorkspaceError(error.message); }
}

async function stopNotebook() {
  if (!confirm('停止当前 Python 环境？已经保存的 Notebook 和作业记录不会删除。')) return;
  try { await request('/api/notebook/stop', { method: 'POST' }); setWorkspaceAccess(false, '环境已停止'); le('workspaceNotice').textContent = '环境已停止，运行代码时会重新启动。'; }
  catch (error) { showWorkspaceError(error.message); }
}

initLearningLab().catch(error => { le('lessonStage').innerHTML = `<div class="notice">${esc(error.message)}</div>`; });
