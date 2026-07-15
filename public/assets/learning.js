const learning = {
  course: null, completed: [], lessonNotes: {}, currentLessonId: null, currentAssignment: null,
  canRun: false, config: {}, drafts: new Map(), records: new Map(), running: false
};
const le = id => document.getElementById(id);

function allLessons() { return learning.course.chapters.flatMap(chapter => chapter.lessons.map(lesson => ({ ...lesson, chapter }))); }
function assignmentIds() { return allLessons().map(item => item.assignment?.id).filter(Boolean); }
function currentLesson() { return allLessons().find(item => item.id === learning.currentLessonId); }

async function initLearningLab() {
  const user = await loadAccount();
  const [courseData, progressData] = await Promise.all([request('/api/learning/course'), request('/api/learning/progress')]);
  learning.course = courseData.course; learning.canRun = courseData.canRun; learning.config = courseData.config || {};
  learning.completed = progressData.progress?.completedLessons || [];
  learning.lessonNotes = progressData.progress?.lessonNotes || {};
  const firstLessonId = allLessons()[0]?.id;
  learning.currentLessonId = null;
  renderDirectory(); showLesson(firstLessonId); showLimits();
  if (learning.canRun) await refreshNotebookStatus(); else setWorkspaceAccess(false, '未开放代码运行权限');
  await Promise.all(assignmentIds().map(id => loadRecords(id, false)));
  updateProgress();
  if (new URLSearchParams(location.search).get('lab') === '1') le('codeWorkspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  le('courseMenu').onclick = () => le('chapterList').classList.toggle('collapsed');
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

function showLesson(id) {
  if (learning.currentLessonId && le('codeEditor')) learning.drafts.set(learning.currentLessonId, le('codeEditor').value);
  learning.currentLessonId = id;
  const lesson = currentLesson(); if (!lesson) return;
  learning.currentAssignment = lesson.assignment || null;
  const blocks = lesson.body.map((block, index) => {
    if (block.type === 'code') return `<div class="lesson-code"><button class="try-code" data-example="${index}" type="button">在右侧运行</button><pre><code>${esc(block.code)}</code></pre></div>`;
    if (block.type === 'tip') return `<div class="lesson-tip">${esc(block.text)}</div>`;
    return `<div class="lesson-block"><p>${esc(block.text)}</p></div>`;
  }).join('');
  const assignment = lesson.assignment ? assignmentHtml(lesson.assignment) : '';
  const lessons = allLessons(), position = lessons.findIndex(item => item.id === id), previous = lessons[position - 1], next = lessons[position + 1];
  le('lessonStage').innerHTML = `<div class="lesson-kicker"><span>第 ${lesson.chapter.number} 章</span><span>预计 ${lesson.duration} 分钟</span></div><h2>${esc(lesson.title)}</h2><p class="lesson-summary">${esc(lesson.summary)}</p>${blocks}${assignment}<div class="lesson-footer"><label for="lessonNotes"><strong>我的课程笔记</strong></label><textarea class="lesson-notes" id="lessonNotes" rows="4" placeholder="笔记按当前账号和课节保存">${esc(learning.lessonNotes[id] || '')}</textarea><button class="button secondary" id="saveLessonNotes" type="button">保存笔记</button><button class="button" id="toggleLesson" type="button">${learning.completed.includes(id) ? '取消完成标记' : '标记本节已完成'}</button><div class="lesson-navigation"><button class="button secondary" id="previousLesson" type="button" ${previous ? '' : 'disabled'}>← ${previous ? esc(previous.title) : '已经是第一节'}</button><button class="button secondary" id="nextLesson" type="button" ${next ? '' : 'disabled'}>${next ? esc(next.title) : '已经是最后一节'} →</button></div></div>`;
  renderDirectory();
  document.querySelectorAll('[data-example]').forEach(button => button.onclick = () => { const block = lesson.body[Number(button.dataset.example)]; setEditor(block.code, `${lesson.title} · 示例`); le('codeWorkspace').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  le('saveLessonNotes').onclick = saveLessonNotes;
  le('toggleLesson').onclick = toggleLesson;
  le('previousLesson').onclick = () => previous && showLesson(previous.id);
  le('nextLesson').onclick = () => next && showLesson(next.id);
  if (lesson.assignment) {
    le('submitAssignment').onclick = submitAssignment;
    loadRecords(lesson.assignment.id, true);
  }
  resetEditor(true);
}

function assignmentHtml(assignment) {
  return `<section class="lesson-assignment" id="assignmentPanel"><div class="assignment-head"><div><span class="assignment-badge">RANDOM TEST ASSIGNMENT</span><h3>${esc(assignment.title)}</h3><p>${esc(assignment.prompt)}</p></div></div><div class="assignment-controls"><label for="submissionVisibility">成绩记录</label><select id="submissionVisibility"><option value="private">仅自己可见</option><option value="public">公开通过状态和资源记录</option></select><button class="button" id="submitAssignment" type="button" ${learning.canRun ? '' : 'disabled'}>提交随机评测</button></div><div class="submission-records"><div class="records-title"><strong>作业记录</strong><small>随机数据在服务器生成</small></div><div class="record-list" id="assignmentRecords"><div class="empty">正在读取记录…</div></div></div></section>`;
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
  const code = saved ?? lesson.assignment?.starterCode ?? firstExample;
  setEditor(code, lesson.assignment ? lesson.assignment.title : `${lesson.title} · 自由练习`);
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

async function submitAssignment() {
  const assignment = learning.currentAssignment; if (!assignment || learning.running) return;
  learning.running = true; const button = le('submitAssignment'); button.disabled = true; button.textContent = '随机评测中…';
  try {
    const data = await request(`/api/learning/assignments/${assignment.id}/submit`, { method: 'POST', body: JSON.stringify({ code: le('codeEditor').value, visibility: le('submissionVisibility').value }) });
    showRunResult(data.result);
    le('workspaceNotice').style.color = data.result.success ? 'var(--accent2)' : 'var(--danger)';
    le('workspaceNotice').textContent = data.result.success ? `作业通过：${data.result.passed}/${data.result.total} 个隐藏测试。` : `尚未通过：${data.result.passed}/${data.result.total} 个隐藏测试。${data.result.error || ''}`;
    if (data.result.success && !learning.completed.includes(learning.currentLessonId)) { learning.completed.push(learning.currentLessonId); await saveProgress(); if (le('toggleLesson')) le('toggleLesson').textContent = '取消完成标记'; }
    await loadRecords(assignment.id, true); updateProgress();
  } catch (error) { showWorkspaceError(error.message); }
  finally { learning.running = false; button.disabled = false; button.textContent = '提交随机评测'; }
}

function showRunResult(result) {
  const output = [result.output, result.error].filter(Boolean).join('\n');
  le('runOutput').textContent = output || (result.success ? '程序运行完成，没有产生标准输出。' : '程序未通过评测。');
  le('runMetrics').innerHTML = `<span>${Number(result.runtimeMs).toFixed(2)} ms</span><span>${formatMemory(result.memoryKB)}</span>${result.total ? `<span>${result.passed}/${result.total} 测试</span>` : ''}`;
  le('workspaceNotice').textContent = result.error || '';
  le('workspaceNotice').style.color = result.success ? 'var(--accent2)' : 'var(--danger)';
}

function formatMemory(kb) { return Number(kb) >= 1024 ? `${(Number(kb) / 1024).toFixed(1)} MB 峰值内存` : `${Number(kb || 0)} KB 峰值内存`; }
function showWorkspaceError(message) { le('workspaceNotice').style.color = 'var(--danger)'; le('workspaceNotice').textContent = message; le('runOutput').textContent = message; }

async function loadRecords(assignmentId, render = true) {
  try { const records = await request(`/api/learning/assignments/${assignmentId}/records`); learning.records.set(assignmentId, records); if (render && learning.currentAssignment?.id === assignmentId) renderRecords(records); }
  catch (error) { if (render && le('assignmentRecords')) le('assignmentRecords').innerHTML = `<div class="notice">${esc(error.message)}</div>`; }
}

function renderRecords(records) {
  const own = records.own || [], shared = records.shared || [];
  const rows = [
    ...own.map(item => recordRow(item, '我的提交')),
    ...shared.map(item => recordRow(item, item.displayName))
  ];
  le('assignmentRecords').innerHTML = rows.length ? rows.join('') : '<div class="empty">还没有提交记录</div>';
  document.querySelectorAll('[data-visibility]').forEach(button => button.onclick = async () => {
    const visibility = button.dataset.current === 'public' ? 'private' : 'public';
    try { await request(`/api/learning/submissions/${button.dataset.visibility}/visibility`, { method: 'PATCH', body: JSON.stringify({ visibility }) }); await loadRecords(learning.currentAssignment.id, true); }
    catch (error) { alert(error.message); }
  });
}

function recordRow(item, label) {
  return `<div class="submission-row"><div><strong>${esc(label)} · ${item.success ? '通过' : '未通过'}</strong><small>${new Date(item.submittedAt).toLocaleString('zh-CN')} · ${item.passed}/${item.total} 个测试</small></div><div class="record-metrics"><span class="${item.success ? 'record-pass' : 'record-fail'}">${item.success ? 'PASS' : 'RETRY'}</span><span>${Number(item.runtimeMs).toFixed(2)} ms</span><span>${formatMemory(item.memoryKB).replace('峰值内存', '')}</span>${item.own ? `<button class="visibility-button" data-visibility="${item.id}" data-current="${item.visibility}">${item.visibility === 'public' ? '公开' : '隐藏'}</button>` : '<span>已公开</span>'}</div></div>`;
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

async function saveProgress() { await request('/api/learning/progress', { method: 'PUT', body: JSON.stringify({ completedLessons: learning.completed, lessonNotes: learning.lessonNotes }) }); }

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
