const lessons = [
  { id: 'intro', title: '1. 认识 Python', html: '<h2>认识 Python</h2><p>Python 使用缩进组织代码，语法清晰，适合自动化、数据分析与网络开发。</p><pre><code>print("Hello, Polynomial Server!")</code></pre><h3>练习</h3><p>尝试修改引号中的内容。Notebook 执行区将在下一阶段开放。</p>' },
  { id: 'variables', title: '2. 变量与类型', html: '<h2>变量与基本类型</h2><p>变量不需要提前声明类型。常见类型包括整数、浮点数、字符串和布尔值。</p><pre><code>name = "Polynomial"\nyear = 2026\nactive = True\nprint(name, year, active)</code></pre>' },
  { id: 'control', title: '3. 条件与循环', html: '<h2>条件与循环</h2><pre><code>score = 85\nif score >= 60:\n    print("通过")\n\nfor number in range(3):\n    print(number)</code></pre><p>注意 <code>if</code> 和 <code>for</code> 后面的冒号与下一行缩进。</p>' },
  { id: 'functions', title: '4. 函数', html: '<h2>函数</h2><pre><code>def greet(name):\n    return f"你好，{name}"\n\nprint(greet("学习者"))</code></pre><p>函数把可复用的步骤包装起来，并可以返回结果。</p>' }
];
let completed = [], current = 'intro', notes = '';
async function initLearning() {
  try { await loadAccount(); const data = await request('/api/learning/progress'); completed = data.progress?.completedLessons || []; notes = data.progress?.notes || ''; renderLessons(); showLesson(current); }
  catch (error) { document.querySelector('#lessonContent').innerHTML = `<div class="notice">${error.message}</div>`; }
}
function renderLessons() {
  document.querySelector('#lessonList').innerHTML = lessons.map(lesson => `<button data-lesson="${lesson.id}" class="${lesson.id === current ? 'active' : ''}"><span>${completed.includes(lesson.id) ? '✓' : '○'}</span>${lesson.title}</button>`).join('');
  document.querySelectorAll('[data-lesson]').forEach(button => button.onclick = () => showLesson(button.dataset.lesson));
  document.querySelector('#courseProgress').value = completed.length; document.querySelector('#progressLabel').textContent = `${completed.length} / ${lessons.length} 已完成`;
}
function showLesson(id) {
  current = id; const lesson = lessons.find(item => item.id === id);
  document.querySelector('#lessonContent').innerHTML = lesson.html + `<div class="lesson-actions"><button class="button" id="completeLesson">${completed.includes(id) ? '标记为未完成' : '完成本课'}</button><textarea id="lessonNotes" rows="5" placeholder="课程笔记（按账号保存）"></textarea><button class="button secondary" id="saveNotes">保存学习记录</button></div>`;
  document.querySelector('#lessonNotes').value = notes; renderLessons();
  document.querySelector('#completeLesson').onclick = async () => { completed = completed.includes(id) ? completed.filter(item => item !== id) : [...completed, id]; await saveProgress(); showLesson(id); };
  document.querySelector('#saveNotes').onclick = saveProgress;
}
async function saveProgress() { notes = document.querySelector('#lessonNotes')?.value || notes; await request('/api/learning/progress', { method: 'PUT', body: JSON.stringify({ completedLessons: completed, notes }) }); renderLessons(); }
initLearning();
